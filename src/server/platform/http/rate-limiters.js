import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from './error-codes.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// English fallbacks; the panel renders the `code` in the language the user picked.
const TOO_MANY_ATTEMPTS = {
  error: 'Too many attempts. Wait a moment and try again.',
  code: ERROR_CODES.RATE_LIMIT_LOGIN,
};

const TOO_MANY_REQUESTS = {
  error: 'Too many requests. Wait a moment and try again.',
  code: ERROR_CODES.RATE_LIMIT_API,
};

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
    message: TOO_MANY_ATTEMPTS,
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
    message: TOO_MANY_REQUESTS,
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
    message: TOO_MANY_REQUESTS,
    ...options,
  });
}

/**
 * Soft limit for the panel SPA (served without authentication).
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
