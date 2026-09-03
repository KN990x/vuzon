import { asyncHandler } from '../../bootstrap/async-handler.js';
import { sendApiRouteError } from '../../platform/http/api-route-error.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';
import {
  createLoginRateLimiter,
  createLogoutRateLimiter,
  createCredentialVerifyRateLimiter,
  createSetupRateLimiter,
} from '../../platform/http/rate-limiters.js';
import { SESSION_COOKIE_NAME } from '../../platform/session/middleware.js';
import { loginBodySchema } from './login-body.js';
import { passwordChangeBodySchema, setupBodySchema, usernameChangeBodySchema } from './setup-body.js';
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
  credentialVerifyLimiter = createCredentialVerifyRateLimiter(),
} = {}) {
  // Synchronous claim lock for the setup window. Node is single-threaded, so checking and
  // setting this flag in the same tick is atomic across handlers: the second concurrent
  // POST /api/setup cannot slip past isConfigured() while the first is still awaiting scrypt.
  // Cleared in finally so a failed validation does not permanently block the wizard.
  let setupInProgress = false;

  /**
   * First-install wizard. Public by necessity: there is no credential to authenticate
   * against yet, so whoever reaches the panel first claims it (the same trust-on-first-use
   * model as Uptime Kuma or Nextcloud). The 409 below is what closes that window for good
   * (including while the first claim is still hashing), and it is checked BEFORE validating
   * the body so a configured panel gives an attacker nothing to probe.
   */
  app.post('/api/setup', setupLimiter, asyncHandler(async (req, res) => {
    if (credentialStore.isConfigured() || setupInProgress) {
      return res.status(409).json({
        error: 'The panel is already set up',
        code: ERROR_CODES.SETUP_ALREADY_DONE,
      });
    }

    setupInProgress = true;
    try {
      let body;
      try {
        body = setupBodySchema.parse(req.body);
      } catch (err) {
        return sendApiRouteError(res, err);
      }

      // Claiming the panel must drop every session issued before it. `session-secret` and
      // `session-epoch` survive the `auth.json` deletion that credential-store.js documents
      // as the password-reset path, so without this a cookie captured before the reset
      // stayed valid for its full 7-day maxAge against the brand-new credentials.
      //
      // Revoke BEFORE writing credentials. The other order left a window where `auth.json`
      // already held the new hash but a failed epoch write (full volume) answered 500
      // without moving the mark — stolen cookies kept working against the new password.
      // If the save fails after this, the caller re-enters with the previous credentials
      // (or the wizard, on first setup); that is recoverable. The reverse is not.
      revokeSessionsIssuedUntilNow();
      await credentialStore.save({ username: body.username, password: body.password });

      // Signing in right away: asking the user to retype what they just chose adds nothing.
      req.session = {
        authenticated: true,
        issuedAt: nextIssuedAt(),
      };

      return res.json({ success: true });
    } finally {
      setupInProgress = false;
    }
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
  app.post('/api/account/password', requireAuth, credentialVerifyLimiter, asyncHandler(async (req, res) => {
    let body;
    try {
      body = passwordChangeBodySchema.parse(req.body);
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    const username = credentialStore.getUsername();
    // 400, not 401: a wrong current password is a validation failure, not an expired
    // session. The SPA treats every 401 as UnauthorizedError and may bounce to login.
    if (!(await credentialStore.verify({ username, password: body.currentPassword }))) {
      return res.status(400).json({
        error: 'The current password is not correct',
        code: ERROR_CODES.AUTH_CURRENT_PASSWORD_INVALID,
      });
    }

    // A password change must drop every other session, including a cookie copied earlier:
    // that is the whole point of changing it. Revoke first (see the setup route), then
    // persist the new hash. `updatePassword` reads the live username inside the store lock
    // so a concurrent rename is not overwritten by the name captured above, before verify.
    // The caller's own session is re-stamped so they are not logged out of this tab
    // (`nextIssuedAt` guarantees a mark strictly above the one just set).
    revokeSessionsIssuedUntilNow();
    await credentialStore.updatePassword(body.newPassword);
    req.session = {
      authenticated: true,
      issuedAt: nextIssuedAt(),
    };

    return res.json({ success: true });
  }));

  /**
   * Username change: same guard order and session revocation as the password route. The
   * password hash is left untouched (`updateUsername`); only the login name changes.
   */
  app.post('/api/account/username', requireAuth, credentialVerifyLimiter, asyncHandler(async (req, res) => {
    let body;
    try {
      body = usernameChangeBodySchema.parse(req.body);
    } catch (err) {
      return sendApiRouteError(res, err);
    }

    const currentUsername = credentialStore.getUsername();

    // The password is verified BEFORE the no-op short-circuit below. Answering the
    // same-name case first turned the route into an unlimited username oracle: it returned
    // 200 without the KDF, and `skipSuccessfulRequests` on the limiter means a 200 costs no
    // quota either, so the caller could probe names for free.
    // Same 400 (not 401) as the password route: see comment there.
    if (!(await credentialStore.verify({ username: currentUsername, password: body.currentPassword }))) {
      return res.status(400).json({
        error: 'The current password is not correct',
        code: ERROR_CODES.AUTH_CURRENT_PASSWORD_INVALID,
      });
    }

    // Same name after trim: nothing to write and no reason to kick other sessions.
    if (body.newUsername === currentUsername) {
      return res.json({ success: true });
    }

    // Revoke first (same reason as the password route), then persist the new name.
    revokeSessionsIssuedUntilNow();
    await credentialStore.updateUsername(body.newUsername);
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
