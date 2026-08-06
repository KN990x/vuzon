import express from 'express';
import { getServerRuntime } from '../config/runtime.js';
import { resolveSessionSecret } from '../config/session-secret.js';
import { createCredentialStore } from '../features/auth/credential-store.js';
import { createRequireAuth } from '../features/auth/require-auth.js';
import { configureSessionEpochPersistence } from '../features/auth/session-epoch.js';
import {
  createSessionMiddleware,
  getSessionCookieClearOptions,
  SESSION_COOKIE_NAME,
} from '../platform/session/middleware.js';
import { registerAuthRoutes } from '../features/auth/routes.js';
import { registerApiRoutes } from '../features/email-routing/routes.js';
import { registerPageRoutes } from '../features/pages/routes.js';
import { createCloudflareClient } from '../platform/cloudflare/client.js';
import { createApiErrorHandler, createFallbackErrorHandler } from '../platform/http/api-route-error.js';
import { ERROR_CODES } from '../platform/http/error-codes.js';
import {
  createApiRateLimiter,
  createLoginRateLimiter,
  createLogoutRateLimiter,
  createPagesRateLimiter,
  createCredentialVerifyRateLimiter,
  createSetupRateLimiter,
} from '../platform/http/rate-limiters.js';
import { createSameOriginGuard } from '../platform/http/same-origin-guard.js';
import { resolveDataDir } from '../platform/storage/data-dir.js';
import { resolvePublicDir } from './resolve-public-dir.js';

const JSON_BODY_LIMIT = '256kb';

/** Strict CSP for the React/Vite bundle: local assets only, no eval. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  // No 'unsafe-inline': the production build ships a real stylesheet and emits neither
  // <style> blocks nor literal style="" attributes (Vite only injects those in dev).
  // The panel's handful of inline styles — Switch's knob offset, use-dialog's scroll lock,
  // clipboard's off-screen textarea — are all CSSOM assignments, which CSP does not govern
  // in the first place, so allowing 'unsafe-inline' bought nothing and weakened the policy.
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
].join('; ');

function createSecurityHeadersMiddleware({ hsts = false } = {}) {
  return function securityHeadersMiddleware(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (hsts) {
      // No includeSubDomains/preload: on a homelab the domain may have HTTP subdomains.
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}

/**
 * /api responses carry session data (aliases, destinations, domain) and must not stay
 * in the browser cache nor in an intermediate proxy's. Express sets no cache header
 * of its own.
 */
function createApiCacheControlMiddleware() {
  return function apiCacheControlMiddleware(req, res, next) {
    const pathStr = req.path || '';
    if (pathStr === '/api' || pathStr.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  };
}

export function createApp({
  env = process.env,
  cloudflareClient = createCloudflareClient({ env }),
  dataDir = resolveDataDir(env),
  credentialStore = createCredentialStore({ dataDir }),
  sessionSecret = resolveSessionSecret({ dataDir }),
  publicDir = resolvePublicDir(env),
  loginLimiter = createLoginRateLimiter(),
  logoutLimiter = createLogoutRateLimiter(),
  setupLimiter = createSetupRateLimiter(),
  credentialVerifyLimiter = createCredentialVerifyRateLimiter(),
  apiLimiter = createApiRateLimiter(),
  pagesLimiter = createPagesRateLimiter(),
} = {}) {
  configureSessionEpochPersistence({ dataDir });

  const runtime = getServerRuntime(env);
  const app = express();

  // Nothing useful comes from telling the world which framework serves the panel.
  app.disable('x-powered-by');
  app.set('trust proxy', runtime.trustProxy);
  // Express matches routes case-insensitively by default, but every guard below tests
  // `req.path` against a lowercase '/api/' prefix. Without this, `GET /API/rules` reached
  // the route handler while skipping Cache-Control: no-store, the same-origin guard AND the
  // API error handler — so a Cloudflare failure answered with its upstream status, the
  // upstream message and a stack trace instead of the `{ error, code }` envelope.
  app.set('case sensitive routing', true);

  // HSTS only with COOKIE_SECURE=1 (deployed behind TLS); on plain-HTTP homelabs it must not be sent.
  app.use(createSecurityHeadersMiddleware({ hsts: runtime.cookieSecure }));
  app.use(createApiCacheControlMiddleware());
  // CSRF invariant (no explicit token). It rests on four pillars:
  //   1. Session cookie with sameSite: 'lax' (platform/session/middleware.js).
  //   2. Mutations only via JSON: express.json without urlencoded (a cross-site <form>
  //      cannot send application/json without a CORS preflight).
  //   3. No CORS: no external origin can fetch with credentials.
  //   4. Same-origin guard on /api mutations (platform/http/same-origin-guard.js):
  //      allows same-origin / none; rejects same-site and mismatched Origin;
  //      allows curl (no Origin / no Sec-Fetch-Site).
  // Changing any of these means revisiting this decision.
  //
  // Pillar 2 covers only the routes that REQUIRE a body. `POST /api/rules/:id/enable`,
  // `/disable` and `/api/logout` read nothing from `req.body`, so a cross-site
  // `<form enctype="text/plain">` targeting them is a simple request: no preflight, body
  // irrelevant. They are still stopped, by pillars 1 and 4 — but they rest on two of the
  // four, which is what makes the same-origin guard load-bearing rather than defence in
  // depth. Weakening the guard's curl allowance is not a free change for those three.
  //
  // The guard runs BEFORE express.json on purpose: it only reads headers, so parsing up to
  // 256kb of a request that is about to be rejected with 403 is wasted work — and a
  // malformed cross-origin body used to fail in the parser before the guard ever saw it.
  app.use(createSameOriginGuard());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(createSessionMiddleware({
    sessionSecret,
    cookieSecure: runtime.cookieSecure,
  }));

  const requireAuth = createRequireAuth({ credentialStore });

  registerAuthRoutes(app, {
    credentialStore,
    requireAuth,
    sessionCookieName: SESSION_COOKIE_NAME,
    sessionCookieClearOptions: getSessionCookieClearOptions({ cookieSecure: runtime.cookieSecure }),
    loginLimiter,
    logoutLimiter,
    setupLimiter,
    credentialVerifyLimiter,
  });
  registerApiRoutes(app, { env, requireAuth, credentialStore, cloudflareClient, apiLimiter });
  // The /api JSON 404 must be registered BEFORE registerPageRoutes' SPA catch-all:
  // reversed, an unknown GET /api/... would return index.html.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found', code: ERROR_CODES.SERVER_NOT_FOUND });
  });
  registerPageRoutes(app, { publicDir, pagesLimiter });
  app.use(createApiErrorHandler());
  // Terminal: catches what the API handler forwards (SPA/static paths). Without it those
  // errors reached Express's finalhandler, which prints the stack trace into the response
  // whenever NODE_ENV is not 'production' — which is every non-Docker run.
  app.use(createFallbackErrorHandler());

  return {
    app,
    runtime,
    credentialStore,
  };
}
