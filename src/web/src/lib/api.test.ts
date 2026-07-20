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

test('200 JSON devuelve el body tipado', async () => {
  stubFetch({ body: { result: [1, 2] } });
  await expect(apiRequest('/api/rules')).resolves.toEqual({ result: [1, 2] });
});

test('envía método, body JSON y credentials en mutaciones', async () => {
  const fetchMock = stubFetch({ body: { success: true } });
  await apiRequest('/api/login', 'POST', { username: 'u', password: 'p' });

  const [path, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe('/api/login');
  expect(options.method).toBe('POST');
  expect(options.credentials).toBe('include');
  expect(JSON.parse(options.body as string)).toEqual({ username: 'u', password: 'p' });
});

test('401 lanza UnauthorizedError con el mensaje del body', async () => {
  stubFetch({ status: 401, body: { error: 'Credenciales incorrectas' } });
  await expect(apiRequest('/api/login', 'POST', {})).rejects.toThrowError(
    new UnauthorizedError('Credenciales incorrectas'),
  );
});

test('401 sin body JSON usa el mensaje genérico', async () => {
  stubFetch({ status: 401, contentType: 'text/html', body: null });
  const error = await apiRequest('/api/me').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect((error as Error).message).toBe('Sesión expirada');
});

test('respuesta no JSON con redirect se trata como sesión expirada', async () => {
  stubFetch({ contentType: 'text/html', redirected: true });
  await expect(apiRequest('/api/me')).rejects.toBeInstanceOf(UnauthorizedError);
});

test('respuesta no JSON sin redirect lanza error genérico con status', async () => {
  stubFetch({ status: 502, contentType: 'text/html' });
  await expect(apiRequest('/api/me')).rejects.toThrowError(
    'Respuesta inesperada del servidor (502)',
  );
});

test('JSON ilegible lanza error con status', async () => {
  stubFetch({ status: 200, invalidJson: true });
  await expect(apiRequest('/api/me')).rejects.toThrowError(
    'Respuesta JSON inválida del servidor (200)',
  );
});

test('error HTTP con body usa data.error', async () => {
  stubFetch({ status: 400, body: { error: 'Alias: El alias no puede estar vacío' } });
  await expect(apiRequest('/api/rules', 'POST', {})).rejects.toThrowError(
    'Alias: El alias no puede estar vacío',
  );
});

test('error HTTP sin mensaje usa Error <status>', async () => {
  stubFetch({ status: 500, body: {} });
  await expect(apiRequest('/api/rules')).rejects.toThrowError('Error 500');
});

test('error HTTP no-401 lanza ApiError con el status transportado', async () => {
  stubFetch({ status: 429, body: { error: 'Demasiadas peticiones. Espera unos minutos.' } });
  const error = await apiRequest('/api/addresses', 'POST', {}).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(429);
  expect((error as ApiError).message).toBe('Demasiadas peticiones. Espera unos minutos.');
});
