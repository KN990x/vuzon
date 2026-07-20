import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequireAuth } from '../../features/auth/require-auth.js';

test('requireAuth: API sin sesión responde 401 JSON', () => {
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
    assert.fail('no debía llamar next');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: petición no-API sin sesión también responde 401 JSON (sin redirect)', () => {
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
    assert.fail('no debía llamar next');
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'No autorizado' });
});

test('requireAuth: sesión autenticada y vigente llama next', () => {
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

test('requireAuth: sesión sin issuedAt (versión anterior) se rechaza con 401', () => {
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
    assert.fail('no debía llamar next');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: sin AUTH_USER/AUTH_PASS en servidor responde 500', () => {
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
    assert.fail('no debía llamar next');
  });
  assert.equal(res.statusCode, 500);
});
