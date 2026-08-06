import cookieSession from 'cookie-session';

export const SESSION_COOKIE_NAME = 'vuzon_session';

/**
 * Cookie lifetime AND the server-side ceiling on a session's age.
 *
 * Exported because the cookie attribute alone is advisory: it asks the browser to forget
 * the cookie, and nothing stops a copy from being replayed afterwards. `session-epoch.js`
 * enforces the same value against the session's `issuedAt`, so both must come from here.
 */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export function getSessionCookieClearOptions({ cookieSecure = false } = {}) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
  };
}

export function getSessionCookieOptions({ cookieSecure = false } = {}) {
  return {
    ...getSessionCookieClearOptions({ cookieSecure }),
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function createSessionMiddleware({
  sessionSecret,
  cookieSecure = false,
} = {}) {
  const cookieOpts = getSessionCookieOptions({ cookieSecure });
  return cookieSession({
    name: SESSION_COOKIE_NAME,
    keys: [sessionSecret],
    ...cookieOpts,
  });
}
