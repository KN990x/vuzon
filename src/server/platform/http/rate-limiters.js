import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from './error-codes.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// English fallbacks; the panel renders the `code` in the language the user picked.
const TOO_MANY_LOGIN_ATTEMPTS = {
  error: 'Too many sign-in attempts. Wait a moment and try again.',
  code: ERROR_CODES.RATE_LIMIT_LOGIN,
};

// Setup and the credential-change routes. Same shape as login, different code: they run
// the same slow KDF but the user is not signing in, and the login copy said they were.
const TOO_MANY_CREDENTIAL_ATTEMPTS = {
  error: 'Too many attempts. Wait a moment and try again.',
  code: ERROR_CODES.RATE_LIMIT_CREDENTIAL,
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
    message: TOO_MANY_LOGIN_ATTEMPTS,
    ...options,
  });
}

/**
 * Limit for the first-install wizard (`POST /api/setup`), which is public until the panel
 * has credentials. Deliberately WITHOUT `skipSuccessfulRequests`: the route succeeds at
 * most once, so the quota exists to bound the hammering that happens BEFORE that — each
 * attempt runs a deliberately slow KDF.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createSetupRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 10,
    message: TOO_MANY_CREDENTIAL_ATTEMPTS,
    ...options,
  });
}

/**
 * Shared limit for the two routes that verify the current password before acting
 * (`/api/account/password` and `/api/account/username`). Each request runs a deliberately
 * slow KDF, so they get the same anti-brute-force treatment as login — and, like login,
 * successful calls are not charged.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createCredentialVerifyRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 10,
    skipSuccessfulRequests: true,
    message: TOO_MANY_CREDENTIAL_ATTEMPTS,
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
 *
 * It covers the static asset directory as well as the two HTML routes, so the quota is
 * sized per page LOAD rather than per request: index.html plus the JS chunk, the
 * stylesheet and the favicon is ~4-5 requests, and a hard refresh re-fetches all of them.
 * 500 leaves room for ~100 cold loads per window while still bounding an anonymous
 * flood — the reason the directory is behind a limiter at all.
 *
 * `message` is set explicitly: without it express-rate-limit emits its default text/plain
 * body, which would make this the one limiter in the panel not answering `{ error, code }`.
 * @param {import('express-rate-limit').Options} [options]
 */
export function createPagesRateLimiter(options = {}) {
  return rateLimit({
    ...sharedRateLimitOptions,
    windowMs: FIFTEEN_MINUTES_MS,
    max: 500,
    message: TOO_MANY_REQUESTS,
    ...options,
  });
}
