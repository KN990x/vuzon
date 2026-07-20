import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const sharedRateLimitOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  // Express trust proxy is configured separately; avoid express-rate-limit hard-failing
  // when TRUST_PROXY is off (homelab default). Trade-off: a too-permissive TRUST_PROXY
  // (spoofable X-Forwarded-For → rate-limit bypass) will not be flagged either.
  validate: { trustProxy: false },
};

/**
 * Límite estricto para intentos de login (anti fuerza bruta).
 * Los logins correctos no consumen cupo.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createLoginRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 10,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' },
    ...options,
  });
}

/**
 * Límite para el logout. Deliberadamente SIN `skipSuccessfulRequests`: el logout
 * siempre responde 200, así que reutilizar el limiter de login lo dejaría sin acotar.
 * El cupo es holgado porque cerrar sesión es una acción legítima y barata.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createLogoutRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 60,
    message: { error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' },
    ...options,
  });
}

/**
 * Límite suave para la API autenticada (protege la cuota de Cloudflare).
 *
 * El cupo se dimensiona a partir del coste real de una acción del panel: una mutación
 * más el refresco posterior (`refreshAll` en Dashboard.tsx) son ~4 peticiones. Con 600
 * caben ~150 acciones por ventana, holgado para un panel de un solo usuario. Con el
 * valor anterior (120) el propio panel se autobloqueaba a las ~24 acciones.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createApiRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 600,
    message: { error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' },
    ...options,
  });
}

/**
 * Límite suave para la página del panel autenticada.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createPagesRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 100,
    ...options,
  });
}
