import express from 'express';
import { getServerRuntime } from '../config/runtime.js';
import { resolveSessionSecret } from '../config/session-secret.js';
import { createRequireAuth } from '../features/auth/require-auth.js';
import {
  createSessionMiddleware,
  getSessionCookieClearOptions,
  SESSION_COOKIE_NAME,
} from '../platform/session/middleware.js';
import { registerAuthRoutes } from '../features/auth/routes.js';
import { registerApiRoutes } from '../features/email-routing/routes.js';
import { registerPageRoutes } from '../features/pages/routes.js';
import { createCloudflareClient } from '../platform/cloudflare/client.js';
import { createApiErrorHandler } from '../platform/http/api-route-error.js';
import {
  createApiRateLimiter,
  createLoginRateLimiter,
  createLogoutRateLimiter,
} from '../platform/http/rate-limiters.js';
import { resolvePublicDir } from './resolve-public-dir.js';

const JSON_BODY_LIMIT = '256kb';

/** Strict CSP for the React/Vite bundle: local assets only, no eval. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
].join('; ');

function createSecurityHeadersMiddleware({ hsts = false } = {}) {
  return function securityHeadersMiddleware(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (hsts) {
      // Sin includeSubDomains/preload: en un homelab el dominio puede tener subdominios HTTP.
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}

/**
 * Las respuestas de /api llevan datos de la sesión (alias, destinos, dominio) y no
 * deben quedar en la caché del navegador ni en la de un proxy intermedio. Express no
 * pone ninguna cabecera de caché por su cuenta.
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
  sessionSecret = resolveSessionSecret({ env }),
  publicDir = resolvePublicDir(env),
  loginLimiter = createLoginRateLimiter(),
  logoutLimiter = createLogoutRateLimiter(),
  apiLimiter = createApiRateLimiter(),
} = {}) {
  const runtime = getServerRuntime(env);
  const app = express();

  app.set('trust proxy', runtime.trustProxy);

  // HSTS solo con COOKIE_SECURE=1 (despliegue tras TLS); en homelab HTTP no debe emitirse.
  app.use(createSecurityHeadersMiddleware({ hsts: runtime.cookieSecure }));
  app.use(createApiCacheControlMiddleware());
  // Invariante CSRF (sin token explícito). Descansa en tres pilares:
  //   1. Cookie de sesión con sameSite: 'lax' (platform/session/middleware.js).
  //   2. Mutaciones solo vía JSON: express.json sin urlencoded (un <form> cross-site
  //      no puede enviar application/json sin preflight CORS).
  //   3. Sin CORS: ningún origen externo puede hacer fetch con credenciales.
  // Cambiar cualquiera de los tres obliga a revisar esta decisión.
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(createSessionMiddleware({
    sessionSecret,
    cookieSecure: runtime.cookieSecure,
  }));

  const requireAuth = createRequireAuth({ env });

  registerAuthRoutes(app, {
    env,
    sessionCookieName: SESSION_COOKIE_NAME,
    sessionCookieClearOptions: getSessionCookieClearOptions({ cookieSecure: runtime.cookieSecure }),
    loginLimiter,
    logoutLimiter,
  });
  registerApiRoutes(app, { env, requireAuth, cloudflareClient, apiLimiter });
  // El 404 JSON de /api debe registrarse ANTES del catch-all SPA de registerPageRoutes:
  // si se invierte el orden, un GET /api/... desconocido devolvería index.html.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No encontrado' });
  });
  registerPageRoutes(app, { publicDir });
  app.use(createApiErrorHandler());

  return {
    app,
    runtime,
  };
}
