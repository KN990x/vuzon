import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequireAuth } from '../../features/auth/require-auth.js';

test('requireAuth: API without a session answers 401 JSON', () => {
  const requireAuth = createRequireAuth({
    env: { AUTH_USER: 'u', AUTH_PASS: 'p' },
  });
  const req = {
    path: '/api/me',
    session: {},
    accepts: () => false,
  };
  const res = {
    statusCode: 0,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {},
  };
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: a non-API request without a session also answers 401 JSON (no redirect)', () => {
  const requireAuth = createRequireAuth({
    env: { AUTH_USER: 'u', AUTH_PASS: 'p' },
  });
  const req = {
    path: '/',
    session: {},
    accepts: (type) => type === 'html',
  };
  const res = {
    statusCode: 0,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(payload) {
      this.body = payload;
    },
  };
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized', code: 'auth.unauthorized' });
});

test('requireAuth: an authenticated, current session calls next', () => {
  let called = false;
  const requireAuth = createRequireAuth({
    env: { AUTH_USER: 'u', AUTH_PASS: 'p' },
  });
  const req = {
    path: '/api/me',
    session: { authenticated: true, issuedAt: Date.now() },
    accepts: () => false,
  };
  requireAuth(req, {}, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('requireAuth: a session without issuedAt (previous version) is rejected with 401', () => {
  const requireAuth = createRequireAuth({
    env: { AUTH_USER: 'u', AUTH_PASS: 'p' },
  });
  const req = {
    path: '/api/me',
    session: { authenticated: true },
    accepts: () => false,
  };
  const res = {
    statusCode: 0,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {},
  };
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: without AUTH_USER/AUTH_PASS on the server it answers 500', () => {
  const requireAuth = createRequireAuth({ env: {} });
  const req = {
    path: '/api/rules',
    session: {},
  };
  const res = {
    statusCode: 0,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {},
  };
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 500);
});
