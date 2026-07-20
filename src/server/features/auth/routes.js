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

  // No requireAuth on purpose: logging out with an already expired cookie must be
  // idempotent and return 200. It uses its own limiter and NOT the login one: that one
  // carries `skipSuccessfulRequests`, and since logout always answers 200 it would never
  // consume quota, leaving the endpoint effectively unbounded.
  app.post('/api/logout', logoutLimiter, (req, res) => {
    // Clearing the cookie only removes it from THIS browser; the revocation mark also
    // invalidates any copy of the cookie still within its maxAge.
    revokeSessionsIssuedUntilNow();
    req.session = null;
    res.clearCookie(sessionCookieName, sessionCookieClearOptions);
    return res.json({ success: true });
  });
}
