/** 401 en cualquier llamada: el cliente decide volver al login (sin redirect de servidor). */
export class UnauthorizedError extends Error {
  constructor(message = 'Sesión expirada') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Error HTTP no-401 con el status transportado (permite decidir por código, no por texto). */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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
    // El body puede traer un error específico (p. ej. "Credenciales incorrectas" en login).
    let message = 'Sesión expirada';
    if (isJson) {
      try {
        const data = (await res.json()) as { error?: unknown };
        if (typeof data?.error === 'string' && data.error) {
          message = data.error;
        }
      } catch {
        // body ilegible: se mantiene el mensaje genérico
      }
    }
    throw new UnauthorizedError(message);
  }

  if (!isJson) {
    if (res.redirected) {
      throw new UnauthorizedError();
    }
    throw new Error(`Respuesta inesperada del servidor (${res.status})`);
  }

  let data: { error?: unknown; message?: unknown };
  try {
    data = await res.json();
  } catch {
    throw new Error(`Respuesta JSON inválida del servidor (${res.status})`);
  }

  if (!res.ok) {
    const message =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
