import { getPanelAuthCredentials } from '../../config/panel-auth-env.js';
import { sendApiRouteError } from '../../platform/http/api-route-error.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { createLoginRateLimiter, createLogoutRateLimiter } from '../../platform/http/rate-limiters.js';
import { SESSION_COOKIE_NAME } from '../../platform/session/middleware.js';
import { loginBodySchema } from './login-body.js';
import { timingSafeStringEqual } from './safe-string-equal.js';
import {
  isSessionIssuanceValid,
  nextIssuedAt,
  revokeSessionsIssuedUntilNow,
} from './session-epoch.js';

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
      return res.status(500).json({
        error: 'Server credentials are not configured (AUTH_USER/AUTH_PASS)',
        code: ERROR_CODES.AUTH_CREDENTIALS_MISSING,
      });
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
      return res.status(401).json({
        error: 'Invalid credentials',
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      });
    }

    req.session = {
      authenticated: true,
      username: authUser,
      // Lets logout invalidate the cookie even though it is self-contained (session-epoch.js).
      issuedAt: nextIssuedAt(),
    };

    return res.json({ success: true });
  });

  // No requireAuth on purpose: logging out with an already expired cookie must be
  // idempotent and return 200. It uses its own limiter and NOT the login one: that one
  // carries `skipSuccessfulRequests`, and since logout always answers 200 it would never
  // consume quota, leaving the endpoint effectively unbounded.
  app.post('/api/logout', logoutLimiter, (req, res) => {
    // Only a live session may bump the global revocation mark. An anonymous POST must
    // not invalidate everyone else's cookies (and must not be a CSRF DoS vector).
    const hasLiveSession = Boolean(
      req.session?.authenticated && isSessionIssuanceValid(req.session.issuedAt),
    );
    if (hasLiveSession) {
      // Clearing the cookie only removes it from THIS browser; the revocation mark also
      // invalidates any copy of the cookie still within its maxAge.
      revokeSessionsIssuedUntilNow();
    }
    req.session = null;
    res.clearCookie(sessionCookieName, sessionCookieClearOptions);
    return res.json({ success: true });
  });
}
