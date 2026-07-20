import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SESSION_COOKIE_NAME,
  createSessionMiddleware,
  getSessionCookieClearOptions,
  getSessionCookieOptions,
} from '../../platform/session/middleware.js';

const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;

test('la cookie de sesión mantiene el nombre publicado', () => {
  assert.equal(SESSION_COOKIE_NAME, 'vuzon_session');
});

test('opciones de borrado: httpOnly y sameSite lax son invariantes del modelo CSRF', () => {
  const opts = getSessionCookieClearOptions();
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
});

test('secure sigue a COOKIE_SECURE: apagado por defecto para homelab en HTTP', () => {
  assert.equal(getSessionCookieClearOptions().secure, false);
  assert.equal(getSessionCookieClearOptions({ cookieSecure: false }).secure, false);
  assert.equal(getSessionCookieClearOptions({ cookieSecure: true }).secure, true);
});

test('las opciones de creación añaden maxAge de 7 días sobre las de borrado', () => {
  const clear = getSessionCookieClearOptions({ cookieSecure: true });
  const create = getSessionCookieOptions({ cookieSecure: true });

  assert.equal(create.maxAge, SEVEN_DAYS_MS);
  // Mismos atributos de identidad: si divergen, clearCookie no borraría la cookie.
  for (const key of ['path', 'httpOnly', 'sameSite', 'secure']) {
    assert.equal(create[key], clear[key], `${key} debe coincidir entre creación y borrado`);
  }
});

test('createSessionMiddleware devuelve un middleware Express de 3 argumentos', () => {
  const middleware = createSessionMiddleware({ sessionSecret: 'x'.repeat(32) });
  assert.equal(typeof middleware, 'function');
  assert.equal(middleware.length, 3);
});
