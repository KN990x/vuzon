import { z } from 'zod';
import { CloudflareApiError } from '../cloudflare/client.js';
import { ERROR_CODES } from './error-codes.js';
import { collectZodIssues, formatZodError } from './format-zod-error.js';
import { PanelRequestError } from './panel-request-error.js';

const GENERIC_CLOUDFLARE_CLIENT_MSG = 'Could not complete the operation with Cloudflare. Check the configuration or try again later.';

/**
 * @param {unknown} err
 * @returns {{ status: number, message: string, code: string, params?: Record<string, unknown> }}
 */
export function resolveApiRouteError(err) {
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      message: formatZodError(err),
      code: ERROR_CODES.VALIDATION_INVALID,
      params: { issues: collectZodIssues(err) },
    };
  }

  // Panel-written message: travels intact (there is nothing from Cloudflare to leak).
  if (err instanceof PanelRequestError) {
    return {
      status: err.status,
      message: err.message,
      code: err.code || ERROR_CODES.SERVER_INTERNAL,
      params: err.params,
    };
  }

  if (err instanceof CloudflareApiError) {
    console.error('Cloudflare API error:', err.message, { code: err.code, details: err.details });
    const status = normalizeCloudflareHttpStatus(err.status);
    return {
      status,
      message: GENERIC_CLOUDFLARE_CLIENT_MSG,
      code: ERROR_CODES.CLOUDFLARE_GENERIC,
    };
  }

  console.error('API route error:', err);
  return {
    status: 500,
    message: 'Internal server error',
    code: ERROR_CODES.SERVER_INTERNAL,
  };
}

/**
 * Keeps Cloudflare 401/403 away from the client: the front-end reads 401 as an expired panel session.
 * @param {number} status
 * @returns {number}
 */
function normalizeCloudflareHttpStatus(status) {
  const n = Number(status);
  if (!Number.isFinite(n) || n < 400) {
    return 502;
  }
  if (n === 401 || n === 403) {
    return 502;
  }
  return n;
}

export function sendApiRouteError(res, err) {
  const { status, message, code, params } = resolveApiRouteError(err);
  const body = { error: message, code };
  if (params && Object.keys(params).length > 0) {
    body.params = params;
  }
  return res.status(status).json(body);
}

export function createApiErrorHandler() {
  return function apiErrorHandler(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }
    const pathStr = req.path || '';
    if (pathStr !== '/api' && !pathStr.startsWith('/api/')) {
      next(err);
      return;
    }
    sendApiRouteError(res, err);
  };
}
