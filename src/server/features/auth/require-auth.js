import { getPanelAuthCredentials } from '../../config/panel-auth-env.js';
import { isSessionIssuanceValid } from './session-epoch.js';

/**
 * Sin sesión responde siempre 401 JSON. El cliente React decide qué pantalla
 * mostrar tras llamar a /api/me; el HTML se sirve sin autenticación (SPA).
 */
export function createRequireAuth({ env = process.env } = {}) {
  const { authUser, authPass } = getPanelAuthCredentials(env);

  return function requireAuth(req, res, next) {
    if (!authUser || !authPass) {
      return res.status(500).json({ error: 'Credenciales de servidor no configuradas (AUTH_USER/AUTH_PASS)' });
    }

    // `issuedAt` se comprueba contra la marca de revocación en memoria: una cookie
    // copiada antes de un logout deja de valer aunque siga dentro de su maxAge.
    // Las sesiones anteriores a esta versión no traen `issuedAt` y se descartan.
    if (req.session && req.session.authenticated && isSessionIssuanceValid(req.session.issuedAt)) {
      return next();
    }

    return res.status(401).json({ error: 'No autorizado' });
  };
}
