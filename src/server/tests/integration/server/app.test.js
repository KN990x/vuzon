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
import { CATCH_ALL_MUTATION_ERROR } from '../../../features/email-routing/catch-all-guard.js';
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

/** Cabeceras Set-Cookie firmadas (cookie + .sig); `get('set-cookie')` no es fiable con varias cookies. */
function sessionCookieHeaderFromResponse(res) {
  const list = res.headers.getSetCookie();
  assert.ok(list && list.length > 0, 'se esperaba al menos una Set-Cookie');
  return list.map((line) => line.split(';')[0].trim()).join('; ');
}

test('integración HTTP: healthz, auth, API con Cloudflare simulado', async () => {
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
      assert.equal(data.email, 'testuser');
      assert.equal(data.rootDomain, 'example.com');
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
      const res = await fetch(`${baseUrl}/api/rules/rule1/disable`, {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      });
      assert.equal(res.status, 200);
      const data = await readJson(res);
      // Contrato de mutación: siempre `ok`, más `result` cuando Cloudflare lo devuelve.
      assert.equal(data.ok, true);
      assert.ok(data.result);
    }

    // Los DELETE comparten el mismo sobre `{ ok: true }`.
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

test('integración HTTP: login con AUTH en env con espacios (trim)', async () => {
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
    assert.equal(meData.email, 'trimuser');
    assert.equal(meData.rootDomain, 'example.com');
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: sin AUTH_USER/AUTH_PASS, POST /api/login responde 500', async () => {
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

test('integración HTTP: cabeceras de seguridad en /healthz', async () => {
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
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok((res.headers.get('referrer-policy') || '').length > 0);
    assert.ok((res.headers.get('content-security-policy') || '').includes("default-src 'self'"));
    assert.ok((res.headers.get('permissions-policy') || '').includes('camera=()'));
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: logout invalida una copia de la cookie de sesión', async () => {
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
    // Copia de la cookie, como la tendría un atacante que la hubiese robado.
    const stolenCookie = sessionCookieHeaderFromResponse(loginRes);

    const before = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: stolenCookie } });
    assert.equal(before.status, 200);

    const logoutRes = await fetch(`${baseUrl}/api/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);

    // La cookie sigue dentro de su maxAge, pero la marca de revocación la invalida.
    const after = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: stolenCookie } });
    assert.equal(after.status, 401);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: las respuestas de /api no se cachean', async () => {
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

    // El 401 anónimo tampoco debe quedar cacheado como respuesta válida.
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

test('integración HTTP: login rate limit responde 429', async () => {
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
    assert.ok(data && typeof data.error === 'string');
    assert.match(data.error, /intentos/i);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: body de login inválido responde 400', async () => {
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

test('integración HTTP: API autenticada rate limit responde 429', async () => {
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
    assert.ok(data && typeof data.error === 'string');
    assert.match(data.error, /peticiones/i);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: peticiones sin sesión no consumen la cuota del rate limit API', async () => {
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
    // Muchas más peticiones anónimas que el max del limiter: siempre 401, nunca 429.
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/api/me`);
      assert.equal(res.status, 401);
    }

    // La cuota sigue intacta para el usuario autenticado.
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

test('integración HTTP: HSTS solo se emite con COOKIE_SECURE activo', async () => {
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

test('integración HTTP: sin src/web/dist la SPA responde 503 con mensaje claro', async () => {
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

test('integración HTTP: no se puede mutar ni borrar catch-all', async () => {
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
    assert.equal((await readJson(bySlug)).error, CATCH_ALL_MUTATION_ERROR);

    const byId = await fetch(`${baseUrl}/api/rules/catch_all_rule`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    assert.equal(byId.status, 400);
    assert.equal((await readJson(byId)).error, CATCH_ALL_MUTATION_ERROR);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

/** Login + cookie de sesión, para los tests que solo necesitan llegar autenticados. */
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

test('integración HTTP: crear alias con destino sin verificar da un mensaje accionable', async () => {
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
      body: JSON.stringify({ localPart: 'nuevo', destEmail: 'dest@example.com' }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.match(data.error, /no está verificado/);
    assert.match(data.error, /dest@example\.com/);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: crear alias con destino desconocido lo dice explícitamente', async () => {
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
      body: JSON.stringify({ localPart: 'nuevo', destEmail: 'desconocido@example.com' }),
    });

    assert.equal(res.status, 400);
    assert.match((await readJson(res)).error, /no está en la lista de destinos/);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: alias duplicado se diagnostica tras el fallo de Cloudflare', async () => {
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
      body: JSON.stringify({ localPart: 'duplicado', destEmail: 'dest@example.com' }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.match(data.error, /ya existe/);
    // El invariante se mantiene: nada del texto de Cloudflare llega al cliente.
    assert.ok(!data.error.includes('mensaje_upstream'));
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: un fallo de Cloudflare sin causa identificable sigue siendo genérico', async () => {
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
      body: JSON.stringify({ localPart: 'otro', destEmail: 'dest@example.com' }),
    });

    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.ok(!data.error.includes('mensaje_upstream'));
    assert.match(data.error, /No se pudo completar la operación con Cloudflare/);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: PUT /api/rules/:id cambia el destino y respeta el catch-all', async () => {
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
      body: JSON.stringify({ destEmail: 'dest@example.com' }),
    });
    assert.equal(ok.status, 200);
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].body.actions, [{ type: 'forward', value: ['dest@example.com'] }]);
    // El matcher (la dirección del alias) no se toca.
    assert.deepEqual(puts[0].body.matchers, [
      { type: 'literal', field: 'to', value: 'alias@example.com' },
    ]);

    // El catch-all sigue siendo de solo lectura, por slug y por id real.
    const bySlug = await fetch(`${baseUrl}/api/rules/catch_all`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ destEmail: 'dest@example.com' }),
    });
    assert.equal(bySlug.status, 400);
    assert.equal((await readJson(bySlug)).error, CATCH_ALL_MUTATION_ERROR);

    const byId = await fetch(`${baseUrl}/api/rules/catch_all_rule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ destEmail: 'dest@example.com' }),
    });
    assert.equal(byId.status, 400);
    assert.equal((await readJson(byId)).error, CATCH_ALL_MUTATION_ERROR);

    assert.equal(puts.length, 1, 'ninguna mutación del catch-all debe llegar a Cloudflare');

    // Un destino sin verificar se rechaza igual que al crear.
    const unverified = await fetch(`${baseUrl}/api/rules/rule1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ destEmail: 'desconocido@example.com' }),
    });
    assert.equal(unverified.status, 400);
    assert.match((await readJson(unverified)).error, /no está en la lista de destinos/);
  } finally {
    resetSessionEpochForTests();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: rechazo async sin try/catch llega al manejador de errores API', async () => {
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
    assert.equal(data.error, 'Error interno del servidor');
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('integración HTTP: CloudflareApiError 401 no se expone como 401 al cliente', async () => {
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
