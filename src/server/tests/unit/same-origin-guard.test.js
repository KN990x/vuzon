import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSameOriginGuard } from '../../platform/http/same-origin-guard.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * Pillar 4 of the CSRF model (see create-app.js).
 *
 * It had only three cases of integration coverage, and it carries more weight than the
 * pillar count suggests: the body-less mutations (`/api/rules/:id/enable`, `/disable`,
 * `/api/logout`) read nothing from `req.body`, so the "JSON-only" pillar does not apply to
 * them and they rest on the lax cookie plus this guard alone.
 *
 * The awkward part of the contract is the deliberate curl allowance — neither header
 * present means "not a browser" and passes. Every case below either exercises that hole or
 * checks that it stays exactly that narrow.
 */

/** Minimal req/res doubles with the surface the guard touches. */
function runGuard({ method = 'POST', path = '/api/rules', headers = {} } = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const req = {
    method,
    path,
    get: (name) => lower[name.toLowerCase()],
  };

  const result = { nexted: false, status: null, body: null };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
  };

  createSameOriginGuard()(req, res, () => {
    result.nexted = true;
  });
  return result;
}

const allowed = (opts) => runGuard(opts).nexted === true;
const blocked = (opts) => {
  const r = runGuard(opts);
  return r.nexted === false && r.status === 403 && r.body?.code === ERROR_CODES.CSRF_BLOCKED;
};

test('same-origin-guard: only /api mutations are inspected', () => {
  // Reads are never guarded, and neither is anything outside /api.
  assert.ok(allowed({ method: 'GET', headers: { 'sec-fetch-site': 'cross-site' } }));
  assert.ok(allowed({ method: 'POST', path: '/', headers: { 'sec-fetch-site': 'cross-site' } }));
  assert.ok(allowed({ method: 'POST', path: '/apifoo', headers: { 'sec-fetch-site': 'cross-site' } }));

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.ok(blocked({ method, headers: { 'sec-fetch-site': 'cross-site' } }), method);
  }
  // Exactly '/api' counts too, not just '/api/...'.
  assert.ok(blocked({ path: '/api', headers: { 'sec-fetch-site': 'cross-site' } }));
});

test('same-origin-guard: Sec-Fetch-Site same-origin and none pass, same-site does not', () => {
  assert.ok(allowed({ headers: { 'sec-fetch-site': 'same-origin' } }));
  assert.ok(allowed({ headers: { 'sec-fetch-site': 'none' } }));
  // Case-insensitive: the value is a header, not a literal.
  assert.ok(allowed({ headers: { 'sec-fetch-site': 'Same-Origin' } }));

  // `same-site` is the one that must NOT pass on its own: the cookie travels across
  // subdomains and ports of the same registrable site, so a neighbour service would
  // otherwise have a CSRF path in.
  assert.ok(blocked({ headers: { 'sec-fetch-site': 'same-site' } }));
  assert.ok(blocked({ headers: { 'sec-fetch-site': 'cross-site' } }));
});

test('same-origin-guard: with no browser headers at all the request passes (curl)', () => {
  assert.ok(allowed({ headers: {} }));
  assert.ok(allowed({ headers: { host: 'panel.example.com' } }));
});

test('same-origin-guard: Origin must match Host exactly', () => {
  assert.ok(allowed({
    headers: { origin: 'http://panel.example.com', host: 'panel.example.com' },
  }));
  // Host comparison is case-insensitive, as hostnames are.
  assert.ok(allowed({
    headers: { origin: 'http://Panel.Example.com', host: 'panel.example.COM' },
  }));
  // The port is part of the host: a neighbour service on the same name is not us.
  assert.ok(allowed({
    headers: { origin: 'http://panel.example.com:8001', host: 'panel.example.com:8001' },
  }));
  assert.ok(blocked({
    headers: { origin: 'http://panel.example.com:9999', host: 'panel.example.com:8001' },
  }));
  assert.ok(blocked({
    headers: { origin: 'http://evil.example.com', host: 'panel.example.com' },
  }));
  // A subdomain is a different host, even though the cookie would be sent.
  assert.ok(blocked({
    headers: { origin: 'http://other.example.com', host: 'panel.example.com' },
  }));
});

test('same-origin-guard: an Origin present but unusable is blocked, never waved through', () => {
  // `Origin: null` is what a sandboxed iframe or a redirected cross-site POST sends. It is
  // an Origin, so the curl allowance must not apply to it: `new URL('null')` throws and the
  // guard has to fall through to 403 rather than treating it as absent.
  assert.ok(blocked({ headers: { origin: 'null', host: 'panel.example.com' } }));
  assert.ok(blocked({ headers: { origin: 'not a url', host: 'panel.example.com' } }));
  // An Origin with no Host to compare against cannot be verified.
  assert.ok(blocked({ headers: { origin: 'http://panel.example.com' } }));
});

test('same-origin-guard: cross-site still gets the Origin check, and that is the design', () => {
  // Documenting a combination that looks alarming and is not. Every Sec-Fetch-Site value
  // other than same-origin/none — same-site AND cross-site alike — falls through to the
  // exact Origin↔Host match rather than being rejected outright. So this passes:
  assert.ok(allowed({
    headers: {
      'sec-fetch-site': 'cross-site',
      origin: 'http://panel.example.com',
      host: 'panel.example.com',
    },
  }));

  // It is safe because a browser sets both headers itself and cannot be made to emit this
  // pair: a page at another origin producing `cross-site` also produces ITS OWN Origin, not
  // the panel's. Forging both requires a non-browser client — which has no session cookie
  // to ride on, and CSRF is precisely the attack where the browser supplies the cookie.
  assert.ok(blocked({
    headers: {
      'sec-fetch-site': 'cross-site',
      origin: 'http://evil.example.com',
      host: 'panel.example.com',
    },
  }));
});

test('same-origin-guard: an unknown Sec-Fetch-Site value falls back to the Origin check', () => {
  // Forward compatibility: a value this code does not know is not automatically trusted,
  // but it is not automatically fatal either — the Origin match still decides.
  assert.ok(allowed({
    headers: {
      'sec-fetch-site': 'some-future-value',
      origin: 'http://panel.example.com',
      host: 'panel.example.com',
    },
  }));
  assert.ok(blocked({
    headers: { 'sec-fetch-site': 'some-future-value', host: 'panel.example.com' },
  }));
});
