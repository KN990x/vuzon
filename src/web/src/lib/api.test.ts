import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, apiRequest, UnauthorizedError } from './api';

interface FakeResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
  redirected?: boolean;
  invalidJson?: boolean;
}

function stubFetch(init: FakeResponseInit) {
  const {
    status = 200,
    contentType = 'application/json',
    body = {},
    redirected = false,
    invalidJson = false,
  } = init;

  const fetchMock = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    redirected,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    json: async () => {
      if (invalidJson) {
        throw new SyntaxError('Unexpected token');
      }
      return body;
    },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('200 JSON returns the typed body', async () => {
  stubFetch({ body: { result: [1, 2] } });
  await expect(apiRequest('/api/rules')).resolves.toEqual({ result: [1, 2] });
});

test('sends method, JSON body and credentials on mutations', async () => {
  const fetchMock = stubFetch({ body: { success: true } });
  await apiRequest('/api/login', 'POST', { username: 'u', password: 'p' });

  const [path, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe('/api/login');
  expect(options.method).toBe('POST');
  expect(options.credentials).toBe('include');
  expect(JSON.parse(options.body as string)).toEqual({ username: 'u', password: 'p' });
});

test('401 throws UnauthorizedError with the body message and code', async () => {
  stubFetch({
    status: 401,
    body: { error: 'Invalid credentials', code: 'auth.invalid_credentials' },
  });
  const error = await apiRequest('/api/login', 'POST', {}).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect((error as UnauthorizedError).message).toBe('Invalid credentials');
  expect((error as UnauthorizedError).code).toBe('auth.invalid_credentials');
});

test('401 without a JSON body uses the generic message', async () => {
  stubFetch({ status: 401, contentType: 'text/html', body: null });
  const error = await apiRequest('/api/me').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect((error as Error).message).toBe('Session expired');
  expect((error as UnauthorizedError).code).toBe('auth.unauthorized');
});

test('a non-JSON response with a redirect is treated as an expired session', async () => {
  stubFetch({ contentType: 'text/html', redirected: true });
  await expect(apiRequest('/api/me')).rejects.toBeInstanceOf(UnauthorizedError);
});

// A non-JSON or unreadable body carries no server code, so the client attaches its own:
// the screens must be able to tell a proxy HTML page apart from a real API error without
// matching on message text.
test('a non-JSON response without a redirect throws a client-side code with the status', async () => {
  stubFetch({ status: 502, contentType: 'text/html' });
  const error = await apiRequest('/api/me').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(502);
  expect((error as ApiError).code).toBe('client.non_json');
  expect((error as ApiError).params).toEqual({ status: 502 });
});

test('Unreadable JSON throws an error carrying the status', async () => {
  stubFetch({ status: 200, invalidJson: true });
  const error = await apiRequest('/api/me').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(200);
  expect((error as ApiError).code).toBe('client.invalid_json');
});

test('HTTP error with a body uses data.error and carries code + params', async () => {
  stubFetch({
    status: 400,
    body: {
      error: 'Alias: the alias cannot be empty',
      code: 'validation.invalid',
      params: { issues: [{ field: 'localPart', code: 'alias.empty' }] },
    },
  });
  const error = await apiRequest('/api/rules', 'POST', {}).catch((err: unknown) => err);
  expect((error as ApiError).message).toBe('Alias: the alias cannot be empty');
  expect((error as ApiError).code).toBe('validation.invalid');
  expect((error as ApiError).params).toEqual({
    issues: [{ field: 'localPart', code: 'alias.empty' }],
  });
});

test('HTTP error without a message uses Error <status>', async () => {
  stubFetch({ status: 500, body: {} });
  await expect(apiRequest('/api/rules')).rejects.toThrowError('Error 500');
});

test('non-401 HTTP error throws ApiError carrying the status', async () => {
  stubFetch({ status: 429, body: { error: 'Too many requests.', code: 'rate_limit.api' } });
  const error = await apiRequest('/api/addresses', 'POST', {}).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(429);
  expect((error as ApiError).message).toBe('Too many requests.');
  expect((error as ApiError).code).toBe('rate_limit.api');
});
