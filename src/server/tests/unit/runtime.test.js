import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getListenPort,
  getServerRuntime,
  parseCookieSecure,
  parseTrustProxy,
} from '../../config/runtime.js';

test('parseCookieSecure: no value → false (homelab HTTP)', () => {
  assert.equal(parseCookieSecure(undefined), false);
  assert.equal(parseCookieSecure(''), false);
  assert.equal(parseCookieSecure('0'), false);
  assert.equal(parseCookieSecure('false'), false);
});

test('parseCookieSecure: opt-in 1/true/yes', () => {
  assert.equal(parseCookieSecure('1'), true);
  assert.equal(parseCookieSecure('true'), true);
  assert.equal(parseCookieSecure('YES'), true);
});

test('parseTrustProxy: no value → false', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
});

test('parseTrustProxy: explicit false', () => {
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('0'), false);
});

test('parseTrustProxy: true / 1 → one hop', () => {
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('1'), 1);
});

test('parseTrustProxy: hop count', () => {
  assert.equal(parseTrustProxy('2'), 2);
});

test('parseTrustProxy: Express keywords that used to fall back to false', () => {
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('LinkLocal'), 'linklocal');
  assert.equal(parseTrustProxy('uniquelocal'), 'uniquelocal');
});

test('parseTrustProxy: IP/CIDR lists are passed to Express as-is', () => {
  assert.equal(parseTrustProxy('10.0.0.0/8'), '10.0.0.0/8');
  assert.equal(parseTrustProxy('127.0.0.1, 192.168.1.0/24'), '127.0.0.1, 192.168.1.0/24');
  assert.equal(parseTrustProxy('::1'), '::1');
});

test('parseTrustProxy: an unrecognized value falls back to false but warns', () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  assert.equal(parseTrustProxy('yes-please', { warn }), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /TRUST_PROXY/);
});

test('parseTrustProxy: valid values produce no warning', () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  for (const value of ['1', '2', 'false', 'loopback', '10.0.0.0/8', '']) {
    parseTrustProxy(value, { warn });
  }
  assert.deepEqual(warnings, []);
});

test('getServerRuntime includes trustProxy and cookieSecure', () => {
  const r = getServerRuntime({ NODE_ENV: 'production', PORT: '3000' });
  assert.equal(r.trustProxy, false);
  assert.equal(r.cookieSecure, false);
  const r2 = getServerRuntime({
    NODE_ENV: 'development',
    TRUST_PROXY: '1',
    COOKIE_SECURE: '1',
  });
  assert.equal(r2.trustProxy, 1);
  assert.equal(r2.cookieSecure, true);
});

test('getListenPort: PORT=0 is valid (ephemeral)', () => {
  assert.equal(getListenPort({ PORT: '0' }), 0);
  assert.equal(getListenPort({ PORT: 0 }), 0);
});

test('getListenPort: PORT wins over VUZON_PORT', () => {
  assert.equal(getListenPort({ PORT: '3000', VUZON_PORT: '4000' }), 3000);
});

test('getListenPort: without PORT it uses VUZON_PORT', () => {
  assert.equal(getListenPort({ VUZON_PORT: '9000' }), 9000);
});

test('getListenPort: an invalid or negative value falls back to the default', () => {
  assert.equal(getListenPort({ PORT: 'not-a-number' }), 8001);
  assert.equal(getListenPort({ PORT: '-1' }), 8001);
  // Out of range or not an integer: listen() would fail with ERR_SOCKET_BAD_PORT.
  assert.equal(getListenPort({ PORT: '70000' }), 8001);
  assert.equal(getListenPort({ PORT: '8001.5' }), 8001);
});
