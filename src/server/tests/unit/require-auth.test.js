import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequireAuth } from '../../features/auth/require-auth.js';

/** Minimal stand-in for `createCredentialStore`: only `isConfigured` is consulted. */
function stubStore(configured) {
  return {
    isConfigured: () => configured,
    getUsername: () => (configured ? 'u' : ''),
  };
}

function stubRes() {
  return {
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
}

test('requireAuth: API without a session answers 401 JSON', () => {
  const requireAuth = createRequireAuth({ credentialStore: stubStore(true) });
  const req = {
    path: '/api/me',
    session: {},
    accepts: () => false,
  };
  const res = stubRes();
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: a non-API request without a session also answers 401 JSON (no redirect)', () => {
  const requireAuth = createRequireAuth({ credentialStore: stubStore(true) });
  const req = {
    path: '/',
    session: {},
    accepts: (type) => type === 'html',
  };
  const res = stubRes();
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized', code: 'auth.unauthorized' });
});

test('requireAuth: an authenticated, current session calls next', () => {
  let called = false;
  const requireAuth = createRequireAuth({ credentialStore: stubStore(true) });
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
  const requireAuth = createRequireAuth({ credentialStore: stubStore(true) });
  const req = {
    path: '/api/me',
    session: { authenticated: true },
    accepts: () => false,
  };
  const res = stubRes();
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
});

test('requireAuth: with no credentials stored it answers 401 auth.setup_required', () => {
  // 401 and not 500: this is the signal the SPA reads to render the setup wizard, so it
  // has to travel on the same status the login screen already handles.
  const requireAuth = createRequireAuth({ credentialStore: stubStore(false) });
  const req = {
    path: '/api/rules',
    session: {},
  };
  const res = stubRes();
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'auth.setup_required');
});

test('requireAuth: with no credentials stored, even a valid-looking session is refused', () => {
  const requireAuth = createRequireAuth({ credentialStore: stubStore(false) });
  const req = {
    path: '/api/me',
    session: { authenticated: true, issuedAt: Date.now() },
  };
  const res = stubRes();
  requireAuth(req, res, () => {
    assert.fail('next must not be called');
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'auth.setup_required');
});
