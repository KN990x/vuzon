import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { isSessionIssuanceValid } from './session-epoch.js';

/**
 * Without a session it always answers 401 JSON. The React client decides which screen
 * to show after calling /api/me; the HTML is served without authentication (SPA).
 *
 * A panel with no credentials yet answers 401 too, with `auth.setup_required`. That code is
 * what tells the SPA to render the setup wizard instead of the login form, and it is why
 * the panel needs no extra "is it configured?" endpoint: `GET /api/me` already answers it.
 */
export function createRequireAuth({ credentialStore } = {}) {
  return function requireAuth(req, res, next) {
    if (!credentialStore.isConfigured()) {
      return res.status(401).json({
        error: 'The panel has no credentials yet: finish the setup first',
        code: ERROR_CODES.AUTH_SETUP_REQUIRED,
      });
    }

    // `issuedAt` is checked against the revocation mark (persisted in session-epoch): a
    // cookie copied before a logout stops being valid even if it is still within its maxAge.
    // Sessions predating this version carry no `issuedAt` and are discarded.
    if (req.session && req.session.authenticated && isSessionIssuanceValid(req.session.issuedAt)) {
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized',
      code: ERROR_CODES.AUTH_UNAUTHORIZED,
    });
  };
}
