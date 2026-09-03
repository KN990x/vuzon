const CF_API_URL = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GET_RETRIES = 2;
const MAX_LIST_PAGES = 100;
/**
 * Second, independent ceiling on a listing.
 *
 * Under the client's own `per_page`, 100 pages × 50 items is exactly 5000, so a complete
 * listing of that size must succeed — the page cap is what stops a 101st request.
 * This ceiling exists for the case the page cap cannot see: Cloudflare ignoring
 * `per_page` and returning far more per page. Compared with `>` so a listing that lands
 * exactly on 5000 is accepted, and one item past it is not.
 */
const MAX_LIST_ITEMS = 5000;
/** Must match the `per_page` query sent below. */
const LIST_PAGE_SIZE = 50;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
/**
 * Ceiling on an honoured `Retry-After`. The header is upstream-controlled and the panel
 * still owes the browser an answer: a `Retry-After: 3600` must not park the request for an
 * hour. Past the cap the client gives up and reports the error instead of waiting.
 */
const MAX_RETRY_AFTER_MS = 5_000;

export class CloudflareApiError extends Error {
  constructor(message, {
    status = 500,
    code = 'cloudflare_error',
    details = null,
    retryable = false,
    retryAfterMs = 0,
    cause = null,
  } = {}) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;

    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * `Retry-After` as milliseconds, clamped to `MAX_RETRY_AFTER_MS`.
 *
 * RFC 9110 allows both a delay in seconds and an HTTP date; Cloudflare sends seconds, but
 * both are cheap to accept. Anything unparseable, negative or absent yields 0, which lets
 * the caller fall back to its own linear backoff.
 *
 * @param {string | null} headerValue
 * @returns {number}
 */
function parseRetryAfter(headerValue) {
  if (!headerValue) {
    return 0;
  }

  const trimmed = String(headerValue).trim();
  const seconds = Number(trimmed);
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(trimmed) - Date.now();

  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return 0;
  }
  return Math.min(delayMs, MAX_RETRY_AFTER_MS);
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

/**
 * HTTP status to carry on the error.
 *
 * Cloudflare's v4 API sometimes answers `HTTP 200` with `{"success": false, "errors": [...]}`.
 * Taking `res.status` verbatim gave the error a status of 200, and the caller's
 * `status >= 400 && status < 500` test for "the panel sent something wrong" was false — so
 * rule-diagnostics never ran and a duplicate alias or an unverified destination came back as
 * the generic Cloudflare message instead of the actionable one. A rejected envelope is a
 * client error regardless of the HTTP code that carried it.
 *
 * @param {number} status
 * @returns {number}
 */
function errorStatusFor(status) {
  const n = Number(status);
  if (!Number.isFinite(n) || n < 400) {
    return 400;
  }
  return n;
}

function buildResponseError({ res, parsed, requestPath, method, retryAfterMs = 0 }) {
  if (!parsed.isJson || typeof parsed.body !== 'object' || parsed.body === null) {
    // A non-JSON body is not the panel's fault: keep 502 as the "upstream misbehaved" mark.
    return new CloudflareApiError(`Unexpected response from Cloudflare (HTTP ${res.status})`, {
      status: res.status >= 400 ? res.status : 502,
      code: 'invalid_response',
      retryable: isRetryableStatus(res.status),
      retryAfterMs,
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
    status: errorStatusFor(res.status),
    code,
    retryable: isRetryableStatus(res.status),
    retryAfterMs,
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

      // Set inside the catch and awaited AFTER `finally`. Sleeping inside the catch kept
      // the aborted attempt's 10s timer armed for the whole backoff, because `finally` —
      // and its `clearTimeout` — does not run until the catch block has fully settled.
      let retryDelayMs = 0;

      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const parsed = await parseCloudflareResponse(res);

        // A successful mutation with no body is still a success. `parseCloudflareResponse`
        // only parses JSON when the content-type announces it, so a 204 (or any empty 2xx)
        // on DELETE reached `buildResponseError` and came back as a 502 `invalid_response`
        // — the panel reporting failure for a DELETE that had already gone through, leaving
        // the row on screen and the user retrying into a 404. Cloudflare answers 200+JSON
        // on DELETE today; this keeps a change there from becoming a data-desync bug.
        //
        // GET is excluded on purpose. The same empty 2xx on a listing was treated as
        // `{ result: null }`, which `fetchAllCloudflare` then coerced to `[]` and took as
        // a complete empty page — dest-in-use and the duplicate-alias pre-check both
        // fail-open on an empty list, and GET /api/rules paints the panel empty.
        if (
          method !== 'GET'
          && res.ok
          && !parsed.isJson
          && (res.status === 204 || parsed.body === '')
        ) {
          return { success: true, result: null };
        }

        const okHttpAndApi = res.ok && parsed.body?.success !== false;
        const validJsonObject = parsed.isJson
          && typeof parsed.body === 'object'
          && parsed.body !== null;
        if (!okHttpAndApi || !validJsonObject) {
          throw buildResponseError({
            res,
            parsed,
            requestPath,
            method,
            retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
          });
        }

        return parsed.body;
      } catch (err) {
        const normalizedError = err instanceof CloudflareApiError
          ? err
          : err?.name === 'AbortError'
            ? buildTransportError({
              requestPath,
              method,
              message: 'Cloudflare did not respond in time',
              cause: err,
              status: 504,
              code: 'upstream_timeout',
            })
            : buildTransportError({
              requestPath,
              method,
              message: 'Could not connect to Cloudflare',
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

        // Cloudflare's own `Retry-After` wins over the linear backoff when it asks for
        // longer: retrying a 429 after 200ms just spends another slice of the same quota.
        // Capped so a large header value cannot stall the request past its own budget.
        retryDelayMs = Math.max(200 * (attempt + 1), normalizedError.retryAfterMs || 0);
        attempt += 1;
      } finally {
        clearTimeout(timeoutId);
      }

      if (retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
    }

    // Unreachable today (the last attempt always throws, since `canRetry` requires
    // `attempt < MAX_GET_RETRIES`). Kept explicit so a future change to the retry
    // conditions surfaces here instead of as a `TypeError` on `data.result`.
    throw new CloudflareApiError('Cloudflare request exhausted its retries', {
      status: 502,
      code: 'retries_exhausted',
      retryable: false,
      details: { requestPath, method },
    });
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
          'Pagination limit exceeded while listing Cloudflare resources.',
          {
            status: 502,
            code: 'list_pagination_limit',
            retryable: false,
          },
        );
      }

      const data = await requestCloudflare(
        `${requestPath}${separator}page=${page}&per_page=${LIST_PAGE_SIZE}`,
      );

      // A listing that did not come back as a list is not an empty page. Coercing
      // `result: null` or an object to `[]` stopped pagination and looked complete —
      // dest-in-use skipped every alias, and the duplicate-alias pre-check let a twin
      // through. Fail closed; `result: []` is the legitimate empty listing.
      if (!Array.isArray(data.result)) {
        throw new CloudflareApiError(
          'Cloudflare listing did not return an array',
          {
            status: 502,
            code: 'invalid_response',
            retryable: false,
            details: { requestPath, page },
          },
        );
      }

      const pageResult = data.result;
      if (pageResult.length) {
        allResults = allResults.concat(pageResult);
      }

      if (allResults.length > MAX_LIST_ITEMS) {
        throw new CloudflareApiError(
          'Item limit exceeded while listing Cloudflare resources.',
          {
            status: 502,
            code: 'list_items_limit',
            retryable: false,
          },
        );
      }

      // Prefer Cloudflare's own cursor when it is a real integer. If it is missing or
      // malformed but this page came back full, keep walking until a short page — a
      // truncated alias list is the worst failure mode (duplicates and dest-in-use look
      // complete when they are not).
      if (Number.isInteger(data.result_info?.total_pages)) {
        totalPages = data.result_info.total_pages;
      } else if (pageResult.length >= LIST_PAGE_SIZE) {
        totalPages = page + 1;
      } else {
        totalPages = page;
      }

      page += 1;
    } while (page <= totalPages);

    return allResults;
  }

  // `requestCloudflare` stays internal: the envelope it returns (`{ success, result, … }`)
  // is an implementation detail, and every caller wants the unwrapped `result` that
  // fetchCloudflare / fetchAllCloudflare hand back. Exposing it also widened the surface
  // that test doubles had to imitate for no benefit.
  return {
    fetchCloudflare,
    fetchAllCloudflare,
  };
}
