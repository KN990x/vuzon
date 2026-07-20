import { ERROR_CODES } from './error-codes.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

/**
 * Defense-in-depth CSRF guard for `/api/*` mutations.
 *
 * Complements the existing three pillars (sameSite lax cookie, JSON-only body, no CORS)
 * without requiring a CSRF token. Scriptable clients (curl) that send neither
 * `Sec-Fetch-Site` nor `Origin` continue to work.
 *
 * @returns {import('express').RequestHandler}
 */
export function createSameOriginGuard() {
  return function sameOriginGuard(req, res, next) {
    const pathStr = req.path || '';
    const isApi = pathStr === '/api' || pathStr.startsWith('/api/');
    if (!isApi || !MUTATING_METHODS.has(req.method)) {
      return next();
    }

    const fetchSite = req.get('sec-fetch-site');
    if (typeof fetchSite === 'string' && ALLOWED_FETCH_SITES.has(fetchSite.toLowerCase())) {
      return next();
    }

    const origin = req.get('origin');
    if (!fetchSite && !origin) {
      return next();
    }

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const requestHost = req.get('host');
        if (
          originHost
          && requestHost
          && originHost.toLowerCase() === requestHost.toLowerCase()
        ) {
          return next();
        }
      } catch {
        // Invalid Origin → fall through to 403.
      }
    }

    return res.status(403).json({
      error: 'Cross-origin request blocked.',
      code: ERROR_CODES.CSRF_BLOCKED,
    });
  };
}
