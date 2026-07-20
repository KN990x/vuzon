const CF_API_URL = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GET_RETRIES = 2;
const MAX_LIST_PAGES = 100;
const MAX_LIST_ITEMS = 5000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class CloudflareApiError extends Error {
  constructor(message, {
    status = 500,
    code = 'cloudflare_error',
    details = null,
    retryable = false,
    cause = null,
  } = {}) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;

    if (cause) {
      this.cause = cause;
    }
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

function buildTransportError({ requestPath, method, message, cause, status, code }) {
  return new CloudflareApiError(message, {
    status,
    code,
    retryable: true,
    cause,
    details: { requestPath, method },
  });
}

async function parseCloudflareResponse(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (!contentType.includes('application/json')) {
    return {
      isJson: false,
      body: await res.text(),
    };
  }

  try {
    return {
      isJson: true,
      body: await res.json(),
    };
  } catch {
    return {
      isJson: false,
      body: null,
    };
  }
}

function buildResponseError({ res, parsed, requestPath, method }) {
  if (!parsed.isJson || typeof parsed.body !== 'object' || parsed.body === null) {
    return new CloudflareApiError(`Respuesta inesperada de Cloudflare (HTTP ${res.status})`, {
      status: res.status || 502,
      code: 'invalid_response',
      retryable: isRetryableStatus(res.status),
      details: {
        requestPath,
        method,
        body: parsed.body,
      },
    });
  }

  const { body } = parsed;
  const firstError = Array.isArray(body.errors) ? body.errors[0] : null;
  const firstMessage = Array.isArray(body.messages) ? body.messages[0] : null;
  const message = firstError?.message
    || firstMessage?.message
    || body.error
    || `Error ${res.status}`;
  const code = firstError?.code || body.code || 'cloudflare_error';

  return new CloudflareApiError(message, {
    status: res.status || 502,
    code,
    retryable: isRetryableStatus(res.status),
    details: {
      requestPath,
      method,
      errors: body.errors || [],
      messages: body.messages || [],
    },
  });
}

export function createCloudflareClient({ env = process.env } = {}) {
  const cfHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
  });

  async function requestCloudflare(requestPath, method = 'GET', body = null) {
    const url = `${CF_API_URL}${requestPath}`;
    const options = {
      method,
      headers: cfHeaders(),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let attempt = 0;

    while (attempt <= MAX_GET_RETRIES) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const parsed = await parseCloudflareResponse(res);

        const okHttpAndApi = res.ok && parsed.body?.success !== false;
        const validJsonObject = parsed.isJson
          && typeof parsed.body === 'object'
          && parsed.body !== null;
        if (!okHttpAndApi || !validJsonObject) {
          throw buildResponseError({ res, parsed, requestPath, method });
        }

        return parsed.body;
      } catch (err) {
        const normalizedError = err instanceof CloudflareApiError
          ? err
          : err?.name === 'AbortError'
            ? buildTransportError({
              requestPath,
              method,
              message: 'Cloudflare no respondió a tiempo',
              cause: err,
              status: 504,
              code: 'upstream_timeout',
            })
            : buildTransportError({
              requestPath,
              method,
              message: 'No se pudo conectar con Cloudflare',
              cause: err,
              status: 502,
              code: 'upstream_unreachable',
            });

        const canRetry = method === 'GET'
          && normalizedError.retryable
          && attempt < MAX_GET_RETRIES;

        if (!canRetry) {
          throw normalizedError;
        }

        await sleep(200 * (attempt + 1));
        attempt += 1;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  async function fetchCloudflare(requestPath, method = 'GET', body = null) {
    const data = await requestCloudflare(requestPath, method, body);
    return data.result;
  }

  async function fetchAllCloudflare(requestPath) {
    let allResults = [];
    let page = 1;
    let totalPages = 1;
    const separator = requestPath.includes('?') ? '&' : '?';

    do {
      if (page > MAX_LIST_PAGES) {
        throw new CloudflareApiError(
          'Se superó el límite de paginación al listar recursos en Cloudflare.',
          {
            status: 502,
            code: 'list_pagination_limit',
            retryable: false,
          },
        );
      }

      const data = await requestCloudflare(`${requestPath}${separator}page=${page}&per_page=50`);

      if (data.result?.length) {
        allResults = allResults.concat(data.result);
      }

      if (allResults.length > MAX_LIST_ITEMS) {
        throw new CloudflareApiError(
          'Se superó el límite de elementos al listar en Cloudflare.',
          {
            status: 502,
            code: 'list_items_limit',
            retryable: false,
          },
        );
      }

      if (data.result_info) {
        totalPages = data.result_info.total_pages;
      }

      page += 1;
    } while (page <= totalPages);

    return allResults;
  }

  return {
    requestCloudflare,
    fetchCloudflare,
    fetchAllCloudflare,
  };
}
