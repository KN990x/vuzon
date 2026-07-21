import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../../../bootstrap/create-app.js';
import { CloudflareApiError } from '../../../platform/cloudflare/client.js';
import {
  createApiRateLimiter,
  createLoginRateLimiter,
} from '../../../platform/http/rate-limiters.js';
import { ERROR_CODES } from '../../../platform/http/error-codes.js';
import {
  CATCH_ALL_MUTATION_CODE,
  CATCH_ALL_MUTATION_ERROR,
} from '../../../features/email-routing/catch-all-guard.js';
import {
  NOT_EDITABLE_RULE_CODE,
  NOT_EDITABLE_RULE_ERROR,
} from '../../../features/email-routing/rule-actions.js';
import { resetSessionEpochForTests } from '../../../features/auth/session-epoch.js';

function createMockCloudflareClient() {
  return {
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.endsWith('/email/routing/rules/catch_all') && method === 'GET') {
        return {
          id: 'catch_all_rule',
          name: 'Catch-all',
          enabled: true,
          matchers: [{ type: 'all' }],
          actions: [{ type: 'forward', value: ['catchall@example.com'] }],
        };
      }

      const isRuleItem = /\/email\/routing\/rules\/[^/]+$/.test(requestPath)
        && !requestPath.endsWith('/email/routing/rules/catch_all');

      if (isRuleItem && method === 'GET') {
        if (requestPath.endsWith('/catch_all_rule')) {
          return {
            id: 'catch_all_rule',
            name: 'Catch-all',
            enabled: true,
            matchers: [{ type: 'all' }],
            actions: [{ type: 'forward', value: ['catchall@example.com'] }],
          };
        }

        return {
          id: 'rule1',
          name: 'alias@example.com',
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'alias@example.com' }],
          actions: [{ type: 'forward', value: ['dest@example.com'] }],
        };
      }

      if (isRuleItem && method === 'PUT') {
        return { ...body, id: 'rule1' };
      }

      if (requestPath.includes('/email/routing/addresses') && method === 'DELETE') {
        return { id: 'deleted' };
      }

      if (requestPath.includes('/email/routing/rules') && method === 'DELETE') {
        return { id: 'deleted' };
      }

      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        return { id: 'new-rule', name: body?.name };
      }

      return {};
    },

    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/rules')) {
        return [{
          id: 'rule1',
          name: 'alias@example.com',
          enabled: true,
          matchers: [],
          actions: [],
        }];
      }
      if (requestPath.includes('/email/routing/addresses')) {
        return [{
          id: 'addr1',
          email: 'dest@example.com',
          verified: true,
        }];
      }
      return [];
    },
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Signed Set-Cookie headers (cookie + .sig); `get('set-cookie')` is unreliable with several cookies. */
function sessionCookieHeaderFromResponse(res) {
  const list = res.headers.getSetCookie();
  assert.ok(list && list.length > 0, 'expected at least one Set-Cookie');
  return list.map((line) => line.split(';')[0].trim()).join('; ');
}

test('HTTP integration: healthz, auth, API with a simulated Cloudflare', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const cloudflareClient = createMockCloudflareClient();
  const { app } = createApp({
    env,
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    {
      const res = await fetch(`${baseUrl}/healthz`);
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.deepEqual(data, { ok: true });
    }

    {
      const res = await fetch(`${baseUrl}/api/me`);
      assert.equal(res.status, 401);
    }

    {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrong' }),
      });
      assert.equal(res.status, 401);
    }

    let sessionCookie = '';
    {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.deepEqual(data, { success: true });
      sessionCookie = sessionCookieHeaderFromResponse(res);
    }

    {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.deepEqual(data, { rootDomain: 'example.com' });
    }

    {
      // Invariant: /api JSON 404 is registered before the SPA catch-all.
      const res = await fetch(`${baseUrl}/api/desconocido`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 404);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      const data = await readJson(res);
      assert.equal(data.error, 'Not found');
      assert.equal(data.code, ERROR_CODES.SERVER_NOT_FOUND);
    }

    {
      const res = await fetch(`${baseUrl}/api/rules`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.ok(Array.isArray(data.result));
      assert.equal(data.result[0].id, 'rule1');
    }

    {
      const res = await fetch(`${baseUrl}/api/rules/catch-all`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.equal(data.result.id, 'catch_all_rule');
      assert.ok(Array.isArray(data.result.actions));
      assert.equal(data.result.actions[0].type, 'forward');
    }

    {
      const res = await fetch(`${baseUrl}/api/rules/not%20valid!/disable`, {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 400);
      const data = await readJson(res);
      assert.ok(data && typeof data.error === 'string');
    }

    {
      const res = await fetch(`${baseUrl}/api/rules/rule1/enable`, {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      assert.equal(data.ok, true);
      assert.ok(data.result);
    }

    {
      const res = await fetch(`${baseUrl}/api/rules/rule1/disable`, {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      // Mutation contract: always `ok`, plus `result` when Cloudflare returns it.
      assert.equal(data.ok, true);
      assert.ok(data.result);
    }

    // DELETEs share the same `{ ok: true }` envelope.
    {
      const res = await fetch(`${baseUrl}/api/rules/rule1`, {
        method: 'DELETE',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await readJson(res), { ok: true });
    }

    {
      const res = await fetch(`${baseUrl}/api/addresses/addr1`, {
        method: 'DELETE',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await readJson(res), { ok: true });
    }
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: login with AUTH env vars carrying whitespace (trim)', async () => {
  const env = {
    AUTH_USER: '  trimuser  ',
    AUTH_PASS: '  trim-pass  ',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: '  example.com  ',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'trimuser', password: 'trim-pass' }),
    });
    assert.equal(res.status, 200);
    const data = await readJson(res);
    assert.deepEqual(data, { success: true });

    const sessionCookie = sessionCookieHeaderFromResponse(res);

    const me = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(me.status, 200);
    const meData = await readJson(me);
    assert.deepEqual(meData, { rootDomain: 'example.com' });
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: without AUTH_USER/AUTH_PASS, POST /api/login answers 500', async () => {
  const env = {
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cualquiera', password: 'cualquiera' }),
    });
    assert.equal(res.status, 500);
    const data = await readJson(res);
    assert.ok(data && typeof data.error === 'string');
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: security headers on /healthz', async () => {
  const env = {
    AUTH_USER: 'u',
    AUTH_PASS: 'p',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.ok((res.headers.get('referrer-policy') || '').length > 0);
    assert.ok((res.headers.get('content-security-policy') || '').includes("default-src 'self'"));
    assert.ok((res.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"));
    assert.ok((res.headers.get('permissions-policy') || '').includes('camera=()'));
    // Express advertises itself by default; nothing useful comes from telling the world.
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: logout invalidates a copy of the session cookie', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();

    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    // Copy of the cookie, as an attacker who had stolen it would hold.
    const stolenCookie = sessionCookieHeaderFromResponse(loginRes);

    const before = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: stolenCookie } });
    assert.equal(before.status, 200);

    // Legitimate logout must carry the session cookie — that is what bumps revocation.
    const logoutRes = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Cookie: stolenCookie },
    });
    assert.equal(logoutRes.status, 200);

    // The cookie is still within its maxAge, but the revocation mark invalidates it.
    const after = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: stolenCookie } });
    assert.equal(after.status, 401);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: anonymous logout does not revoke other sessions', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();

    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = sessionCookieHeaderFromResponse(loginRes);

    const logoutRes = await fetch(`${baseUrl}/api/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);

    const meRes = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(meRes.status, 200);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: anonymous logout is idempotent (200)', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();

    const logoutRes = await fetch(`${baseUrl}/api/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);
    const body = await logoutRes.json();
    assert.deepEqual(body, { success: true });
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: /api responses are not cached', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();

    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    const sessionCookie = sessionCookieHeaderFromResponse(loginRes);

    const res = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    // The anonymous 401 must not be cached as a valid response either.
    const anon = await fetch(`${baseUrl}/api/rules`);
    assert.equal(anon.status, 401);
    assert.equal(anon.headers.get('cache-control'), 'no-store');
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: login rate limit answers 429', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
    loginLimiter: createLoginRateLimiter({ max: 3, windowMs: 60_000 }),
  });

  const { server, baseUrl } = await listen(app);

  try {
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'wrong' }),
      });
      assert.equal(res.status, 401);
    }

    const limited = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrong' }),
    });
    assert.equal(limited.status, 429);
    const data = await readJson(limited);
    assert.ok(data && typeof data.error === 'string' && data.error.length > 0);
    assert.equal(data.code, ERROR_CODES.RATE_LIMIT_LOGIN);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: an invalid login body answers 400', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 123 }),
    });
    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.ok(data && typeof data.error === 'string');
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: authenticated API rate limit answers 429', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
    apiLimiter: createApiRateLimiter({ max: 2, windowMs: 60_000 }),
  });

  const { server, baseUrl } = await listen(app);

  try {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = sessionCookieHeaderFromResponse(loginRes);

    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);
    }

    const limited = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(limited.status, 429);
    const data = await readJson(limited);
    assert.ok(data && typeof data.error === 'string' && data.error.length > 0);
    assert.equal(data.code, ERROR_CODES.RATE_LIMIT_API);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: sessionless requests do not consume the API rate-limit quota', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
    apiLimiter: createApiRateLimiter({ max: 2, windowMs: 60_000 }),
  });

  const { server, baseUrl } = await listen(app);

  try {
    // Far more anonymous requests than the limiter's max: always 401, never 429.
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/api/me`);
      assert.equal(res.status, 401);
    }

    // The quota is still intact for the authenticated user.
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = sessionCookieHeaderFromResponse(loginRes);

    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);
    }

    const limited = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(limited.status, 429);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: HSTS is only sent with COOKIE_SECURE on', async () => {
  const baseEnv = {
    AUTH_USER: 'u',
    AUTH_PASS: 'p',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  for (const [cookieSecure, expectedHeader] of [
    ['1', 'max-age=31536000'],
    [undefined, null],
  ]) {
    const env = { ...baseEnv };
    if (cookieSecure !== undefined) {
      env.COOKIE_SECURE = cookieSecure;
    }

    const { app } = createApp({
      env,
      cloudflareClient: createMockCloudflareClient(),
      sessionSecret: 'test-session-secret-32chars!!',
    });

    const { server, baseUrl } = await listen(app);

    try {
      const res = await fetch(`${baseUrl}/healthz`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('strict-transport-security'), expectedHeader);
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  }
});

test('HTTP integration: without src/web/dist the SPA answers 503 with a clear message', async () => {
  const env = {
    AUTH_USER: 'u',
    AUTH_PASS: 'p',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
    publicDir: path.join(import.meta.dirname, 'no-such-dist'),
  });

  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 503);
    const text = await res.text();
    assert.match(text, /pnpm run build/);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: the catch-all cannot be mutated or deleted', async () => {
  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = sessionCookieHeaderFromResponse(loginRes);

    const bySlug = await fetch(`${baseUrl}/api/rules/catch_all/disable`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(bySlug.status, 400);
    const bySlugBody = await readJson(bySlug);
    assert.equal(bySlugBody.error, CATCH_ALL_MUTATION_ERROR);
    assert.equal(bySlugBody.code, CATCH_ALL_MUTATION_CODE);

    const byId = await fetch(`${baseUrl}/api/rules/catch_all_rule`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(byId.status, 400);
    const byIdBody = await readJson(byId);
    assert.equal(byIdBody.error, CATCH_ALL_MUTATION_ERROR);
    assert.equal(byIdBody.code, CATCH_ALL_MUTATION_CODE);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

/** Login + session cookie, for tests that just need to get authenticated. */
async function loginAndGetCookie(baseUrl, username = 'testuser', password = 'test-secret-pass') {
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(loginRes.status, 200);
  return sessionCookieHeaderFromResponse(loginRes);
}

const DIAGNOSTICS_ENV = {
  AUTH_USER: 'testuser',
  AUTH_PASS: 'test-secret-pass',
  CF_ZONE_ID: 'zone_test_1',
  CF_ACCOUNT_ID: 'acct_test_1',
  DOMAIN: 'example.com',
  NODE_ENV: 'development',
};

test('HTTP integration: POST/PUT /api/rules write the canonical destination email', async () => {
  const posts = [];
  const puts = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        posts.push(body);
      }
      if (method === 'PUT') {
        puts.push({ requestPath, body });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    const created = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ localPart: 'nuevo', action: { type: 'forward', value: ['DEST@Example.com'] } }),
    });
    assert.equal(created.status, 200);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].actions, [{ type: 'forward', value: ['dest@example.com'] }]);

    const updated = await fetch(`${baseUrl}/api/rules/rule1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['DEST@Example.com'] } }),
    });
    assert.equal(updated.status, 200);
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].body.actions, [{ type: 'forward', value: ['dest@example.com'] }]);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: creating an alias with an unverified destination gives an actionable message', async () => {
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/addresses')) {
        return [{ id: 'addr1', email: 'dest@example.com', verified: false }];
      }
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'nuevo', action: { type: 'forward', value: ['dest@example.com'] } }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    // The wording lives in the SPA catalogue; the wire carries the code and the params
    // it interpolates, plus an English fallback.
    assert.equal(data.code, ERROR_CODES.DEST_UNVERIFIED);
    assert.deepEqual(data.params, { email: 'dest@example.com' });
    assert.match(data.error, /dest@example\.com/);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: creating an alias with an unknown destination says so explicitly', async () => {
  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'nuevo', action: { type: 'forward', value: ['desconocido@example.com'] } }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.equal(data.code, ERROR_CODES.DEST_UNKNOWN);
    assert.deepEqual(data.params, { email: 'desconocido@example.com' });
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: a duplicate alias is rejected even when Cloudflare would accept it', async () => {
  // The dangerous case: Cloudflare accepts a duplicate matcher and answers 200, but only
  // the first rule processes the mail. Diagnosing on the error branch never sees it, so
  // the check has to happen before the POST — and the POST must never be issued.
  const posts = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        posts.push(body);
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/rules')) {
        return [{
          id: 'rule1',
          name: 'duplicado@example.com',
          matchers: [{ type: 'literal', field: 'to', value: 'duplicado@example.com' }],
          actions: [],
        }];
      }
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'duplicado', action: { type: 'forward', value: ['dest@example.com'] } }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.equal(data.code, ERROR_CODES.RULES_DUPLICATE_ALIAS);
    assert.deepEqual(data.params, { alias: 'duplicado@example.com' });
    assert.deepEqual(posts, [], 'no duplicate rule may reach Cloudflare');
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: a duplicate alias is diagnosed after the Cloudflare failure', async () => {
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        throw new CloudflareApiError('mensaje_upstream_secreto', { status: 400, code: 'x' });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/rules')) {
        return [{
          id: 'rule1',
          name: 'duplicado@example.com',
          matchers: [{ type: 'literal', field: 'to', value: 'duplicado@example.com' }],
          actions: [],
        }];
      }
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'duplicado', action: { type: 'forward', value: ['dest@example.com'] } }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.equal(data.code, ERROR_CODES.RULES_DUPLICATE_ALIAS);
    assert.deepEqual(data.params, { alias: 'duplicado@example.com' });
    // The invariant holds: none of Cloudflare's text reaches the client.
    assert.ok(!data.error.includes('mensaje_upstream'));
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: a Cloudflare failure with no identifiable cause stays generic', async () => {
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        throw new CloudflareApiError('mensaje_upstream_secreto', { status: 400, code: 'x' });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'otro', action: { type: 'forward', value: ['dest@example.com'] } }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.ok(!data.error.includes('mensaje_upstream'));
    assert.equal(data.code, ERROR_CODES.CLOUDFLARE_GENERIC);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: PUT /api/rules/:id changes the destination and respects the catch-all', async () => {
  const puts = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (method === 'PUT') {
        puts.push({ requestPath, body });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    const ok = await fetch(`${baseUrl}/api/rules/rule1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['dest@example.com'] } }),
    });
    assert.equal(ok.status, 200);
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].body.actions, [{ type: 'forward', value: ['dest@example.com'] }]);
    // The matcher (the alias address) is left untouched.
    assert.deepEqual(puts[0].body.matchers, [
      { type: 'literal', field: 'to', value: 'alias@example.com' },
    ]);

    // The catch-all stays read-only, both by slug and by real id.
    const bySlug = await fetch(`${baseUrl}/api/rules/catch_all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['dest@example.com'] } }),
    });
    assert.equal(bySlug.status, 400);
    const bySlugBody = await readJson(bySlug);
    assert.equal(bySlugBody.error, CATCH_ALL_MUTATION_ERROR);
    assert.equal(bySlugBody.code, CATCH_ALL_MUTATION_CODE);

    const byId = await fetch(`${baseUrl}/api/rules/catch_all_rule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['dest@example.com'] } }),
    });
    assert.equal(byId.status, 400);
    const byIdBody = await readJson(byId);
    assert.equal(byIdBody.error, CATCH_ALL_MUTATION_ERROR);
    assert.equal(byIdBody.code, CATCH_ALL_MUTATION_CODE);

    assert.equal(puts.length, 1, 'no catch-all mutation may reach Cloudflare');

    // An unverified destination is rejected just like on creation.
    const unverified = await fetch(`${baseUrl}/api/rules/rule1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['desconocido@example.com'] } }),
    });
    assert.equal(unverified.status, 400);
    assert.equal((await readJson(unverified)).code, ERROR_CODES.DEST_UNKNOWN);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

/** Rules whose actions the panel must handle without destroying them. */
function createSpecialRulesClient(puts) {
  const base = createMockCloudflareClient();
  const rules = {
    worker_rule: {
      id: 'worker_rule',
      name: 'worker@example.com',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: 'worker@example.com' }],
      actions: [{ type: 'worker', value: ['my-worker'] }],
      source: 'wrangler',
      owner_worker_tag: 'tag_abc123',
    },
    fanout_rule: {
      id: 'fanout_rule',
      name: 'fanout@example.com',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: 'fanout@example.com' }],
      actions: [{ type: 'forward', value: ['a@example.com', 'b@example.com'] }],
    },
    alien_rule: {
      id: 'alien_rule',
      name: 'alien@example.com',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: 'alien@example.com' }],
      // An action type vuzon has never heard of — exactly what a future Cloudflare
      // feature looks like from here.
      actions: [{ type: 'quarantine', value: ['somewhere'] }],
    },
  };

  return {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (method === 'PUT') {
        puts.push({ requestPath, body });
      }
      if (method === 'GET') {
        const id = Object.keys(rules).find((key) => requestPath.endsWith(`/rules/${key}`));
        if (id) {
          return rules[id];
        }
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };
}

test('HTTP integration: a rule with an unknown action type cannot be edited', async () => {
  const puts = [];
  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient: createSpecialRulesClient(puts),
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    // The PUT replaces `actions` wholesale, so a rule the panel cannot even describe is
    // never rewritten — not even to rename it.
    for (const body of [
      { action: { type: 'forward', value: ['dest@example.com'] } },
      { name: 'Renamed' },
      { enabled: false },
    ]) {
      const res = await fetch(`${baseUrl}/api/rules/alien_rule`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 400, JSON.stringify(body));
      const data = await readJson(res);
      assert.equal(data.code, NOT_EDITABLE_RULE_CODE);
      assert.equal(data.error, NOT_EDITABLE_RULE_ERROR);
    }

    assert.deepEqual(puts, [], 'no undescribable rule may be overwritten in Cloudflare');
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: renaming a Worker rule preserves its action untouched', async () => {
  const puts = [];
  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient: createSpecialRulesClient(puts),
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    // The panel never WRITES a worker action; omitting `action` hands back the one
    // Cloudflare gave us, so the binding (and the wrangler ownership) survives.
    const renamed = await fetch(`${baseUrl}/api/rules/worker_rule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Support inbox', enabled: false }),
    });
    assert.equal(renamed.status, 200);
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].body.actions, [{ type: 'worker', value: ['my-worker'] }]);
    assert.equal(puts[0].body.name, 'Support inbox');
    assert.equal(puts[0].body.enabled, false);
    assert.equal(puts[0].body.source, 'wrangler');
    assert.equal(puts[0].body.owner_worker_tag, 'tag_abc123');

    // Switching it to a plain forward IS allowed — the panel asks first, and the whole
    // point of the feature is that the user can take a rule back.
    const switched = await fetch(`${baseUrl}/api/rules/worker_rule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'drop' } }),
    });
    assert.equal(switched.status, 200);
    assert.deepEqual(puts[1].body.actions, [{ type: 'drop' }]);

    // Same for a fan-out rule: preserved when untouched, replaceable on request.
    const fanout = await fetch(`${baseUrl}/api/rules/fanout_rule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(fanout.status, 200);
    assert.deepEqual(puts[2].body.actions, [
      { type: 'forward', value: ['a@example.com', 'b@example.com'] },
    ]);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: POST /api/rules can create a rule that drops the mail', async () => {
  const posts = [];
  const listed = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/rules') && method === 'POST') {
        posts.push(body);
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
    async fetchAllCloudflare(requestPath) {
      listed.push(requestPath);
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ localPart: 'papelera', action: { type: 'drop' } }),
    });

    assert.equal(res.status, 200);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].actions, [{ type: 'drop' }]);
    assert.deepEqual(posts[0].matchers, [
      { type: 'literal', field: 'to', value: 'papelera@example.com' },
    ]);
    // Dropping mail has no destination to verify, so the address list is never fetched.
    // The rules list still is: a duplicate matcher would silently shadow this rule.
    assert.equal(listed.some((path) => path.includes('/email/routing/addresses')), false);
    assert.equal(listed.some((path) => path.includes('/email/routing/rules')), true);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: enable/disable actually flip the rule state', async () => {
  const puts = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (method === 'PUT') {
        puts.push(body);
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { Cookie: sessionCookie };

    // The mock returns `enabled: true`, like Cloudflare does on every GET. Pausing must
    // send `false` regardless — see the regression note in buildRuleUpdatePayload.
    const paused = await fetch(`${baseUrl}/api/rules/rule1/disable`, { method: 'POST', headers });
    assert.equal(paused.status, 200);
    assert.equal(puts[0].enabled, false);

    const resumed = await fetch(`${baseUrl}/api/rules/rule1/enable`, { method: 'POST', headers });
    assert.equal(resumed.status, 200);
    assert.equal(puts[1].enabled, true);

    // Neither touches the action.
    assert.deepEqual(puts[0].actions, [{ type: 'forward', value: ['dest@example.com'] }]);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: PUT /api/rules/catch-all edits the fallback rule safely', async () => {
  const puts = [];
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (method === 'PUT') {
        puts.push({ requestPath, body });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    // Pausing it touches nothing else: the configured action is handed straight back,
    // which is what keeps a Worker-backed catch-all intact.
    const paused = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(paused.status, 200);
    assert.equal(puts.length, 1);
    assert.match(puts[0].requestPath, /\/email\/routing\/rules\/catch_all$/);
    assert.equal(puts[0].body.enabled, false);
    assert.deepEqual(puts[0].body.actions, [
      { type: 'forward', value: ['catchall@example.com'] },
    ]);

    // Re-pointing it writes the canonical address and NEVER a different matcher: a
    // catch-all that stopped catching everything would blackhole mail in silence.
    const repointed = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled: true,
        action: { type: 'forward', value: ['DEST@Example.com'] },
        matchers: [{ type: 'literal', field: 'to', value: 'sneaky@example.com' }],
      }),
    });
    assert.equal(repointed.status, 200);
    assert.deepEqual(puts[1].body.actions, [{ type: 'forward', value: ['dest@example.com'] }]);
    assert.deepEqual(puts[1].body.matchers, [{ type: 'all' }]);
    assert.equal(puts[1].body.enabled, true);

    const dropped = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'drop' } }),
    });
    assert.equal(dropped.status, 200);
    assert.deepEqual(puts[2].body.actions, [{ type: 'drop' }]);
    assert.deepEqual(puts[2].body.matchers, [{ type: 'all' }]);

    // Same destination checks as an alias.
    const unknown = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: { type: 'forward', value: ['desconocido@example.com'] } }),
    });
    assert.equal(unknown.status, 400);
    assert.equal((await readJson(unknown)).code, ERROR_CODES.DEST_UNKNOWN);

    // An empty patch is a client bug, not a no-op write.
    const empty = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);
    assert.equal((await readJson(empty)).code, ERROR_CODES.VALIDATION_INVALID);

    // There is no way to delete it, and the generic rule routes still refuse it.
    const deleted = await fetch(`${baseUrl}/api/rules/catch-all`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(deleted.status, 400);
    assert.equal((await readJson(deleted)).code, CATCH_ALL_MUTATION_CODE);

    assert.equal(puts.length, 3, 'only the three valid edits may reach Cloudflare');
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: a malformed or oversized JSON body answers 4xx, not 500', async () => {
  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);
    const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    // Truncated JSON: express.json throws before any route runs. It used to fall through
    // to the generic branch and answer 500, which reads like a panel bug.
    const malformed = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers,
      body: '{"localPart": "x"',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await readJson(malformed)).code, ERROR_CODES.REQUEST_MALFORMED);

    // Over the 256 kb limit.
    const tooLarge = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ localPart: 'x'.repeat(300 * 1024), action: { type: 'forward', value: ['a@example.com'] } }),
    });
    assert.equal(tooLarge.status, 413);
    assert.equal((await readJson(tooLarge)).code, ERROR_CODES.REQUEST_TOO_LARGE);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: an async rejection without try/catch reaches the API error handler', async () => {
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/rules')) {
        throw new Error('fallo simulado en listado');
      }
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = sessionCookieHeaderFromResponse(loginRes);

    const res = await fetch(`${baseUrl}/api/rules`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(res.status, 500);
    const data = await readJson(res);
    assert.equal(data.error, 'Internal server error');
    assert.equal(data.code, ERROR_CODES.SERVER_INTERNAL);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: a CloudflareApiError 401 is not exposed as 401 to the client', async () => {
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    ...base,
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/addresses')) {
        throw new CloudflareApiError('mensaje_upstream_secreto', { status: 401, code: '9109' });
      }
      return base.fetchAllCloudflare(requestPath);
    },
  };

  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'test-secret-pass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = sessionCookieHeaderFromResponse(loginRes);

    const res = await fetch(`${baseUrl}/api/addresses`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(res.status, 502);
    const data = await readJson(res);
    assert.ok(typeof data.error === 'string');
    assert.ok(!data.error.includes('mensaje_upstream'));
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: DELETE /api/addresses/:id refuses a destination still used by a rule', async () => {
  let addressDeleteCalls = 0;
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/addresses') && method === 'DELETE') {
        addressDeleteCalls += 1;
        return { id: 'deleted' };
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/rules')) {
        return [{
          id: 'rule1',
          name: 'alias@example.com',
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'alias@example.com' }],
          actions: [{ type: 'forward', value: ['dest@example.com'] }],
        }];
      }
      if (requestPath.includes('/email/routing/addresses')) {
        return [{
          id: 'addr1',
          email: 'dest@example.com',
          verified: true,
        }, {
          id: 'addr-free',
          email: 'free@example.com',
          verified: true,
        }];
      }
      return [];
    },
  };

  const env = {
    AUTH_USER: 'testuser',
    AUTH_PASS: 'test-secret-pass',
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
  };

  const { app } = createApp({
    env,
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });

  const { server, baseUrl } = await listen(app);

  try {
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const blocked = await fetch(`${baseUrl}/api/addresses/addr1`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(blocked.status, 400);
    const blockedBody = await readJson(blocked);
    assert.equal(blockedBody.code, ERROR_CODES.DEST_IN_USE);
    assert.equal(blockedBody.params.email, 'dest@example.com');
    assert.match(blockedBody.params.aliases, /alias@example.com/);
    assert.equal(addressDeleteCalls, 0);

    const free = await fetch(`${baseUrl}/api/addresses/addr-free`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(free.status, 200);
    assert.deepEqual(await readJson(free), { ok: true });
    assert.equal(addressDeleteCalls, 1);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: DELETE /api/addresses/:id fails explicitly when catch-all cannot be checked', async () => {
  let addressDeleteCalls = 0;
  const base = createMockCloudflareClient();
  const cloudflareClient = {
    async fetchCloudflare(requestPath, method = 'GET', body = null) {
      if (requestPath.includes('/email/routing/addresses') && method === 'DELETE') {
        addressDeleteCalls += 1;
        return { id: 'deleted' };
      }
      if (requestPath.endsWith('/email/routing/rules/catch_all') && method === 'GET') {
        throw new CloudflareApiError('upstream catch-all failure', { status: 500, code: 'x' });
      }
      return base.fetchCloudflare(requestPath, method, body);
    },
    async fetchAllCloudflare(requestPath) {
      if (requestPath.includes('/email/routing/addresses')) {
        return [{ id: 'addr-free', email: 'free@example.com', verified: true }];
      }
      if (requestPath.includes('/email/routing/rules')) {
        return [];
      }
      return [];
    },
  };

  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient,
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const res = await fetch(`${baseUrl}/api/addresses/addr-free`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(res.status, 502);
    const data = await readJson(res);
    assert.equal(data.code, ERROR_CODES.DEST_USAGE_CHECK_FAILED);
    assert.equal(addressDeleteCalls, 0, 'must not DELETE when catch-all check fails');
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('HTTP integration: same-origin guard blocks a mismatched Origin on mutations', async () => {
  const { app } = createApp({
    env: { ...DIAGNOSTICS_ENV },
    cloudflareClient: createMockCloudflareClient(),
    sessionSecret: 'test-session-secret-32chars!!',
  });
  const { server, baseUrl } = await listen(app);

  try {
    resetSessionEpochForTests();
    const sessionCookie = await loginAndGetCookie(baseUrl);

    const blocked = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        Origin: 'http://evil.test',
      },
      body: JSON.stringify({ localPart: 'x', action: { type: 'forward', value: ['dest@example.com'] } }),
    });
    assert.equal(blocked.status, 403);
    const blockedBody = await readJson(blocked);
    assert.equal(blockedBody.code, ERROR_CODES.CSRF_BLOCKED);

    // curl-style: no Origin and no Sec-Fetch-Site still works.
    const allowed = await fetch(`${baseUrl}/api/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ email: 'new@example.com' }),
    });
    assert.equal(allowed.status, 200);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});
