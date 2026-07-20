import { getPanelAuthCredentials } from '../../config/panel-auth-env.js';
import { isSessionIssuanceValid } from './session-epoch.js';

/**
 * Without a session it always answers 401 JSON. The React client decides which screen
 * to show after calling /api/me; the HTML is served without authentication (SPA).
 */
export function createRequireAuth({ env = process.env } = {}) {
  const { authUser, authPass } = getPanelAuthCredentials(env);

  return function requireAuth(req, res, next) {
    if (!authUser || !authPass) {
      return res.status(500).json({ error: 'Credenciales de servidor no configuradas (AUTH_USER/AUTH_PASS)' });
    }

    // `issuedAt` is checked against the in-memory revocation mark: a cookie copied
    // before a logout stops being valid even if it is still within its maxAge.
    // Sessions predating this version carry no `issuedAt` and are discarded.
    if (req.session && req.session.authenticated && isSessionIssuanceValid(req.session.issuedAt)) {
      return next();
    }

    return res.status(401).json({ error: 'No autorizado' });
  };
}
