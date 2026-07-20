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
 * Strict limit for login attempts (anti brute-force).
 * Successful logins do not consume quota.
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
 * Limit for logout. Deliberately WITHOUT `skipSuccessfulRequests`: logout always answers
 * 200, so reusing the login limiter would leave it unbounded.
 * The quota is generous because logging out is a legitimate and cheap action.
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
 * Soft limit for the authenticated API (protects the Cloudflare quota).
 *
 * The quota is sized from the real cost of a panel action: one mutation plus the
 * following refresh (`refreshAll` in Dashboard.tsx) is ~4 requests. With 600 that fits
 * ~150 actions per window, generous for a single-user panel. With the previous value
 * (120) the panel locked itself out at ~24 actions.
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
 * Soft limit for the authenticated panel page.
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
