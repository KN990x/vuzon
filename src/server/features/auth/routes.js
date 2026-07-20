import { getPanelAuthCredentials } from '../../config/panel-auth-env.js';
import { sendApiRouteError } from '../../platform/http/api-route-error.js';
import { createLoginRateLimiter, createLogoutRateLimiter } from '../../platform/http/rate-limiters.js';
import { SESSION_COOKIE_NAME } from '../../platform/session/middleware.js';
import { loginBodySchema } from './login-body.js';
import { timingSafeStringEqual } from './safe-string-equal.js';
import { revokeSessionsIssuedUntilNow } from './session-epoch.js';

export function registerAuthRoutes(app, {
  env = process.env,
  sessionCookieName = SESSION_COOKIE_NAME,
  sessionCookieClearOptions = {},
  loginLimiter = createLoginRateLimiter(),
  logoutLimiter = createLogoutRateLimiter(),
} = {}) {
  app.post('/api/login', loginLimiter, (req, res) => {
    const { authUser, authPass } = getPanelAuthCredentials(env);
    if (!authUser || !authPass) {
      return res.status(500).json({ error: 'Credenciales de servidor no configuradas (AUTH_USER/AUTH_PASS)' });
    }

    let username;
    let password;
    try {
      ({ username, password } = loginBodySchema.parse(req.body));
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    const userOk = timingSafeStringEqual(username, authUser);
    const passOk = timingSafeStringEqual(password, authPass);

    if (!userOk || !passOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    req.session = {
      authenticated: true,
      username: authUser,
      // Permite invalidar la cookie en el logout pese a ser autocontenida (session-epoch.js).
      issuedAt: Date.now(),
    };

    return res.json({ success: true });
  });

  // Sin requireAuth a propósito: cerrar sesión con una cookie ya caducada debe ser
  // idempotente y devolver 200. Usa su propio limiter y NO el de login: aquel lleva
  // `skipSuccessfulRequests`, y como el logout siempre responde 200 nunca habría
  // consumido cupo, dejando el endpoint efectivamente sin acotar.
  app.post('/api/logout', logoutLimiter, (req, res) => {
    // Borrar la cookie solo la quita de ESTE navegador; la marca de revocación
    // invalida además cualquier copia de la cookie que siguiera dentro de su maxAge.
    revokeSessionsIssuedUntilNow();
    req.session = null;
    res.clearCookie(sessionCookieName, sessionCookieClearOptions);
    return res.json({ success: true });
  });
}
