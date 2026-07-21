import { asyncHandler } from '../../bootstrap/async-handler.js';
import { sendApiRouteError } from '../../platform/http/api-route-error.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';
import {
  createLoginRateLimiter,
  createLogoutRateLimiter,
  createPasswordChangeRateLimiter,
  createSetupRateLimiter,
} from '../../platform/http/rate-limiters.js';
import { SESSION_COOKIE_NAME } from '../../platform/session/middleware.js';
import { loginBodySchema } from './login-body.js';
import { passwordChangeBodySchema, setupBodySchema } from './setup-body.js';
import {
  isSessionIssuanceValid,
  nextIssuedAt,
  revokeSessionsIssuedUntilNow,
} from './session-epoch.js';

export function registerAuthRoutes(app, {
  credentialStore,
  requireAuth,
  sessionCookieName = SESSION_COOKIE_NAME,
  sessionCookieClearOptions = {},
  loginLimiter = createLoginRateLimiter(),
  logoutLimiter = createLogoutRateLimiter(),
  setupLimiter = createSetupRateLimiter(),
  passwordChangeLimiter = createPasswordChangeRateLimiter(),
} = {}) {
  /**
   * First-install wizard. Public by necessity: there is no credential to authenticate
   * against yet, so whoever reaches the panel first claims it (the same trust-on-first-use
   * model as Uptime Kuma or Nextcloud). The 409 below is what closes that window for good,
   * and it is checked BEFORE validating the body so a configured panel gives an attacker
   * nothing to probe.
   */
  app.post('/api/setup', setupLimiter, asyncHandler(async (req, res) => {
    if (credentialStore.isConfigured()) {
      return res.status(409).json({
        error: 'The panel is already set up',
        code: ERROR_CODES.SETUP_ALREADY_DONE,
      });
    }

    let body;
    try {
      body = setupBodySchema.parse(req.body);
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    await credentialStore.save({ username: body.username, password: body.password });

    // Signing in right away: asking the user to retype what they just chose adds nothing.
    req.session = {
      authenticated: true,
      issuedAt: nextIssuedAt(),
    };

    return res.json({ success: true });
  }));

  app.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
    if (!credentialStore.isConfigured()) {
      return res.status(409).json({
        error: 'The panel has no credentials yet: finish the setup first',
        code: ERROR_CODES.AUTH_SETUP_REQUIRED,
      });
    }

    let username;
    let password;
    try {
      ({ username, password } = loginBodySchema.parse(req.body));
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    // One check for both fields: the store runs the KDF even when the username does not
    // match, so the answer takes the same time either way.
    if (!(await credentialStore.verify({ username, password }))) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      });
    }

    req.session = {
      authenticated: true,
      // Lets logout invalidate the cookie even though it is self-contained (session-epoch.js).
      issuedAt: nextIssuedAt(),
    };

    return res.json({ success: true });
  }));

  /**
   * `requireAuth` runs BEFORE the limiter, like every other guarded route: an anonymous
   * caller must not be able to burn the quota of the legitimate user (see create-app.js).
   */
  app.post('/api/account/password', requireAuth, passwordChangeLimiter, asyncHandler(async (req, res) => {
    let body;
    try {
      body = passwordChangeBodySchema.parse(req.body);
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    const username = credentialStore.getUsername();
    if (!(await credentialStore.verify({ username, password: body.currentPassword }))) {
      return res.status(401).json({
        error: 'The current password is not correct',
        code: ERROR_CODES.AUTH_CURRENT_PASSWORD_INVALID,
      });
    }

    await credentialStore.save({ username, password: body.newPassword });

    // A password change must drop every other session, including a cookie copied earlier:
    // that is the whole point of changing it. The caller's own session is re-stamped so the
    // user is not logged out of the tab they are looking at (`nextIssuedAt` guarantees a
    // mark strictly above the one just set).
    revokeSessionsIssuedUntilNow();
    req.session = {
      authenticated: true,
      issuedAt: nextIssuedAt(),
    };

    return res.json({ success: true });
  }));

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
