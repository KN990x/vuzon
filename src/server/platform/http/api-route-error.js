import { z } from 'zod';
import { CloudflareApiError } from '../cloudflare/client.js';
import { formatZodError } from './format-zod-error.js';
import { PanelRequestError } from './panel-request-error.js';

const GENERIC_CLOUDFLARE_CLIENT_MSG = 'No se pudo completar la operación con Cloudflare. Revisa la configuración o inténtalo más tarde.';

/**
 * @param {unknown} err
 * @returns {{ status: number, message: string }}
 */
export function resolveApiRouteError(err) {
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      message: formatZodError(err),
    };
  }

  // Panel-written message: travels intact (there is nothing from Cloudflare to leak).
  if (err instanceof PanelRequestError) {
    return {
      status: err.status,
      message: err.message,
    };
  }

  if (err instanceof CloudflareApiError) {
    console.error('Error de API Cloudflare:', err.message, { code: err.code, details: err.details });
    const status = normalizeCloudflareHttpStatus(err.status);
    return {
      status,
      message: GENERIC_CLOUDFLARE_CLIENT_MSG,
    };
  }

  console.error('Error en ruta API:', err);
  return {
    status: 500,
    message: 'Error interno del servidor',
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
  const { status, message } = resolveApiRouteError(err);
  return res.status(status).json({ error: message });
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
