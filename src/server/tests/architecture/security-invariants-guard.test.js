import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guards for security invariants that no runtime test can observe.
 *
 * The CSRF model has no token: it rests on four pillars (see create-app.js). Pillars 1 and
 * 4 have runtime coverage — the cookie flags in session-middleware.test.js and the guard in
 * app.test.js. Pillars 2 and 3 are *absences*, and an absence cannot be asserted by making
 * a request: adding a urlencoded parser or a CORS middleware would break the model while
 * every existing test kept passing. Same for the rate-limiter shapes, which are injected in
 * create-app.js and never exercised with their production options.
 */

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(architectureDir, '..', '..'); // src/server (@vuzon/server)

function readServerFile(...segments) {
  return fs.readFileSync(path.join(serverDir, ...segments), 'utf8');
}

test('csrf pillar 2: mutations are JSON-only (no urlencoded body parser)', () => {
  const createApp = readServerFile('bootstrap', 'create-app.js');
  assert.equal(
    /express\.urlencoded/.test(createApp),
    false,
    'express.urlencoded would let a cross-site <form> POST without a CORS preflight, '
      + 'which is the whole reason the panel needs no CSRF token. See create-app.js.',
  );
});

test('csrf pillar 3: CORS is not enabled anywhere', () => {
  const pkg = JSON.parse(readServerFile('package.json'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(
    Object.hasOwn(declared, 'cors'),
    false,
    'A CORS middleware would let an external origin fetch with credentials, breaking '
      + 'pillar 3 of the CSRF model. See create-app.js.',
  );

  const createApp = readServerFile('bootstrap', 'create-app.js');
  assert.equal(/Access-Control-Allow-Origin/i.test(createApp), false);
});

test('csrf pillar 4: the /api guards compare a lowercase path, so routing must be case sensitive', () => {
  const createApp = readServerFile('bootstrap', 'create-app.js');
  assert.match(
    createApp,
    /app\.set\('case sensitive routing', true\)/,
    'Express matches routes case-insensitively by default. Without this, GET /API/rules '
      + 'reaches the handler but skips Cache-Control: no-store, the same-origin guard and '
      + 'the API error handler — leaking the upstream Cloudflare message and a stack trace.',
  );
});

test('the same-origin guard runs before the body parser', () => {
  const createApp = readServerFile('bootstrap', 'create-app.js');
  const guardAt = createApp.indexOf('app.use(createSameOriginGuard())');
  const jsonAt = createApp.indexOf('app.use(express.json(');
  assert.notEqual(guardAt, -1);
  assert.notEqual(jsonAt, -1);
  assert.ok(
    guardAt < jsonAt,
    'The guard only reads headers. Parsing up to 256kb of a request that is about to be '
      + 'rejected with 403 is wasted work, and a malformed cross-origin body fails in the '
      + 'parser before the guard ever sees it.',
  );
});

test('logout does not reuse the login limiter shape (skipSuccessfulRequests)', () => {
  const limiters = readServerFile('platform', 'http', 'rate-limiters.js');
  const logout = limiters.slice(limiters.indexOf('export function createLogoutRateLimiter'));
  const body = logout.slice(0, logout.indexOf('\n}'));
  assert.equal(
    /skipSuccessfulRequests/.test(body),
    false,
    'Logout always answers 200, so skipSuccessfulRequests would make it consume no quota '
      + 'at all and leave the endpoint effectively unbounded.',
  );
});

test('the setup limiter charges successful requests too', () => {
  const limiters = readServerFile('platform', 'http', 'rate-limiters.js');
  const setup = limiters.slice(limiters.indexOf('export function createSetupRateLimiter'));
  const body = setup.slice(0, setup.indexOf('\n}'));
  assert.equal(
    /skipSuccessfulRequests/.test(body),
    false,
    'POST /api/setup succeeds at most once; the quota exists to bound the hammering that '
      + 'happens before that, where each attempt runs a deliberately slow KDF.',
  );
});

test('requireAuth is applied before the API rate limiter', () => {
  const routes = readServerFile('features', 'email-routing', 'routes.js');
  assert.match(
    routes,
    /\[\s*requireAuth\s*,\s*apiLimiter\s*\]/,
    'An anonymous caller must not be able to burn the legitimate user\'s quota.',
  );
});

test('every credential route verifies the current password before answering 200', () => {
  const routes = readServerFile('features', 'auth', 'routes.js');
  for (const route of ['/api/account/password', '/api/account/username']) {
    const start = routes.indexOf(`app.post('${route}'`);
    assert.notEqual(start, -1, `${route} is missing`);
    const handler = routes.slice(start, routes.indexOf('\n  }));', start));
    const verifyAt = handler.indexOf('credentialStore.verify');
    const successAt = handler.indexOf('{ success: true }');
    assert.notEqual(verifyAt, -1, `${route} does not verify the current password`);
    assert.ok(
      verifyAt < successAt,
      `${route} can answer { success: true } without running the KDF. Because the limiter `
        + 'sets skipSuccessfulRequests, that path also costs no quota — an unlimited oracle.',
    );
  }
});

test('claiming the panel revokes every session issued before it', () => {
  const routes = readServerFile('features', 'auth', 'routes.js');
  const start = routes.indexOf("app.post('/api/setup'");
  const handler = routes.slice(start, routes.indexOf('\n  }));', start));
  assert.match(
    handler,
    /revokeSessionsIssuedUntilNow\(\)/,
    'session-secret and session-epoch survive the auth.json deletion that credential-store.js '
      + 'documents as the password-reset path, so a cookie captured before the reset would '
      + 'stay valid for its full maxAge against the new credentials.',
  );
});

test('the catch-all route is registered before the parametrised rule route', () => {
  const routes = readServerFile('features', 'email-routing', 'routes.js');
  const dedicated = routes.indexOf("app.put('/api/rules/catch-all'");
  const parametrised = routes.indexOf("app.put('/api/rules/:id'");

  assert.notEqual(dedicated, -1, 'PUT /api/rules/catch-all is missing');
  assert.notEqual(parametrised, -1, 'PUT /api/rules/:id is missing');
  assert.ok(
    dedicated < parametrised,
    'cloudflareResourceIdSchema accepts hyphens, so PUT /api/rules/catch-all matches '
      + '/api/rules/:id. Registered the other way round, the panel\'s own catch-all URL is '
      + 'swallowed by the generic handler — Express matches in registration order and there '
      + 'is no runtime test that can tell the two apart once the order is wrong.',
  );
});

test('the session stamp is checked against a maximum age, not only the revocation mark', () => {
  const epoch = readServerFile('features', 'auth', 'session-epoch.js');
  assert.match(
    epoch,
    /SESSION_MAX_AGE_MS/,
    'cookie-session serialises no expiry, so the cookie maxAge is a browser-side hint: '
      + 'without an age check here a captured cookie authenticates forever unless someone '
      + 'happens to log out or change their password.',
  );
  assert.match(
    epoch,
    /from '\.\.\/\.\.\/platform\/session\/middleware\.js'/,
    'The maximum age must be imported from the module that sets the cookie attribute, so '
      + 'the advertised lifetime and the enforced one cannot drift apart.',
  );
});
