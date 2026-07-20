/**
 * Error payload of the API: `{ error, code, params? }`. `error` is an ENGLISH fallback
 * and `code` is what the panel renders in the active language (see
 * src/web/src/i18n/api-errors.ts). Both errors below carry them so no screen has to
 * parse message text — that used to be done with regexes and broke on any rewording.
 */
interface ApiErrorOptions {
  code?: string;
  params?: Record<string, unknown>;
}

/** 401 on any call: the client decides to go back to login (no server redirect). */
export class UnauthorizedError extends Error {
  code?: string;
  params?: Record<string, unknown>;

  constructor(message = 'Session expired', { code, params }: ApiErrorOptions = {}) {
    super(message);
    this.name = 'UnauthorizedError';
    this.code = code ?? 'auth.unauthorized';
    this.params = params;
  }
}

/** Non-401 HTTP error carrying the status (lets callers decide by code, not by text). */
export class ApiError extends Error {
  status: number;
  code?: string;
  params?: Record<string, unknown>;

  constructor(message: string, status: number, { code, params }: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  params?: unknown;
}

function readErrorFields(data: ApiErrorBody): ApiErrorOptions {
  return {
    code: typeof data.code === 'string' ? data.code : undefined,
    params:
      data.params && typeof data.params === 'object'
        ? (data.params as Record<string, unknown>)
        : undefined,
  };
}

export async function apiRequest<T = unknown>(
  requestPath: string,
  method = 'GET',
  body: Record<string, unknown> | null = null,
): Promise<T> {
  const options: RequestInit = {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (method !== 'GET') {
    options.method = method;

    if (body) {
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(requestPath, options);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  if (res.status === 401) {
    // The body may carry a specific error (e.g. invalid credentials on login).
    let message = 'Session expired';
    let fields: ApiErrorOptions = {};
    if (isJson) {
      try {
        const data = (await res.json()) as ApiErrorBody;
        if (typeof data?.error === 'string' && data.error) {
          message = data.error;
        }
        fields = readErrorFields(data);
      } catch {
        // unreadable body: the generic message stands
      }
    }
    throw new UnauthorizedError(message, fields);
  }

  if (!isJson) {
    if (res.redirected) {
      throw new UnauthorizedError();
    }
    // No JSON body means no server code: the panel supplies its own so the screens can
    // still tell "the proxy answered HTML" apart from a real API error.
    throw new ApiError(`Unexpected response from the server (HTTP ${res.status})`, res.status, {
      code: 'client.non_json',
      params: { status: res.status },
    });
  }

  let data: ApiErrorBody;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(`Invalid JSON response from the server (HTTP ${res.status})`, res.status, {
      code: 'client.invalid_json',
      params: { status: res.status },
    });
  }

  if (!res.ok) {
    const message =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Error ${res.status}`;
    throw new ApiError(message, res.status, readErrorFields(data));
  }

  return data as T;
}
