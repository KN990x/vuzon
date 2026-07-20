import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SESSION_COOKIE_NAME,
  createSessionMiddleware,
  getSessionCookieClearOptions,
  getSessionCookieOptions,
} from '../../platform/session/middleware.js';

const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;

test('the session cookie keeps its published name', () => {
  assert.equal(SESSION_COOKIE_NAME, 'vuzon_session');
});

test('clear options: httpOnly and sameSite lax are invariants of the CSRF model', () => {
  const opts = getSessionCookieClearOptions();
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
});

test('secure follows COOKIE_SECURE: off by default for homelab HTTP', () => {
  assert.equal(getSessionCookieClearOptions().secure, false);
  assert.equal(getSessionCookieClearOptions({ cookieSecure: false }).secure, false);
  assert.equal(getSessionCookieClearOptions({ cookieSecure: true }).secure, true);
});

test('the creation options add a 7-day maxAge on top of the clear options', () => {
  const clear = getSessionCookieClearOptions({ cookieSecure: true });
  const create = getSessionCookieOptions({ cookieSecure: true });

  assert.equal(create.maxAge, SEVEN_DAYS_MS);
  // Mismos atributos de identidad: si divergen, clearCookie no borraría la cookie.
  for (const key of ['path', 'httpOnly', 'sameSite', 'secure']) {
    assert.equal(create[key], clear[key], `${key} must match between creation and clearing`);
  }
});

test('createSessionMiddleware returns a 3-argument Express middleware', () => {
  const middleware = createSessionMiddleware({ sessionSecret: 'x'.repeat(32) });
  assert.equal(typeof middleware, 'function');
  assert.equal(middleware.length, 3);
});
