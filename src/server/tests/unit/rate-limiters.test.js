import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import express from 'express';
import {
  createApiRateLimiter,
  createCredentialVerifyRateLimiter,
  createLoginRateLimiter,
  createLogoutRateLimiter,
  createPagesRateLimiter,
  createSetupRateLimiter,
} from '../../platform/http/rate-limiters.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * The limiters are injected into `createApp`, and the integration suite only ever supplies
 * its own tiny stand-ins for login and the API. Their production shapes — in particular
 * WHICH of them charge a successful request — were never exercised anywhere.
 *
 * That matters most for logout: it always answers 200, so borrowing the login limiter's
 * `skipSuccessfulRequests` would leave the endpoint effectively unbounded.
 */

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
    server.on('error', reject);
  });
}

/**
 * Mounts `limiter` on a route that always answers `status` and hits it `times` times.
 * @returns {Promise<number[]>} the status of each response, in order
 */
async function hammer(limiter, { times, status = 200 }) {
  const app = express();
  app.get('/x', limiter, (_req, res) => res.status(status).json({ ok: true }));
  const { server, baseUrl } = await listen(app);
  try {
    const seen = [];
    for (let i = 0; i < times; i += 1) {
      // Sequential on purpose: express-rate-limit counts per request, and a parallel burst
      // makes the boundary between the last allowed and the first rejected call ambiguous.
      const res = await fetch(`${baseUrl}/x`);
      seen.push(res.status);
    }
    return seen;
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

test('login: successful attempts do not consume quota', async () => {
  const seen = await hammer(createLoginRateLimiter({ max: 3 }), { times: 6, status: 200 });
  assert.deepEqual(seen, [200, 200, 200, 200, 200, 200]);
});

test('login: failed attempts do, and the 429 carries the login code', async () => {
  const app = express();
  app.get('/x', createLoginRateLimiter({ max: 2 }), (_req, res) => res.status(401).json({}));
  const { server, baseUrl } = await listen(app);
  try {
    assert.equal((await fetch(`${baseUrl}/x`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/x`)).status, 401);
    const blocked = await fetch(`${baseUrl}/x`);
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, ERROR_CODES.RATE_LIMIT_LOGIN);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('logout: successful requests DO consume quota', async () => {
  // The invariant: logout always answers 200, so a limiter that skips successful requests
  // would never count anything and the route would be unbounded.
  const seen = await hammer(createLogoutRateLimiter({ max: 2 }), { times: 4, status: 200 });
  assert.deepEqual(seen, [200, 200, 429, 429]);
});

test('setup: successful requests DO consume quota', async () => {
  // Same reasoning, plus each attempt runs a deliberately slow KDF.
  const seen = await hammer(createSetupRateLimiter({ max: 2 }), { times: 4, status: 200 });
  assert.deepEqual(seen, [200, 200, 429, 429]);
});

test('credential-verify: like login, a successful change is not charged', async () => {
  const seen = await hammer(createCredentialVerifyRateLimiter({ max: 2 }), { times: 5 });
  assert.deepEqual(seen, [200, 200, 200, 200, 200]);
});

test('api and pages: every request is charged', async () => {
  assert.deepEqual(
    await hammer(createApiRateLimiter({ max: 2 }), { times: 3 }),
    [200, 200, 429],
  );
  assert.deepEqual(
    await hammer(createPagesRateLimiter({ max: 2 }), { times: 3 }),
    [200, 200, 429],
  );
});

test('the api limiter answers the generic rate-limit code, not the login one', async () => {
  const app = express();
  app.get('/x', createApiRateLimiter({ max: 1 }), (_req, res) => res.json({ ok: true }));
  const { server, baseUrl } = await listen(app);
  try {
    await fetch(`${baseUrl}/x`);
    const blocked = await fetch(`${baseUrl}/x`);
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, ERROR_CODES.RATE_LIMIT_API);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});
