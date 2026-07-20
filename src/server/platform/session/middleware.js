import cookieSession from 'cookie-session';

export const SESSION_COOKIE_NAME = 'vuzon_session';

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

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
