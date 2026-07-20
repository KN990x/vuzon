/**
 * Rejection of the filler values shipped in `.env.example`.
 *
 * Why: `.env.example` lives in a public repository. A template value that passes the
 * normal validations is a secret everybody knows. The serious case is SESSION_SECRET:
 * the `vuzon_session` cookie is signed (not encrypted), so with the published key
 * anyone can forge `{ authenticated: true }` and get in without credentials, without
 * even going through the login limiter.
 *
 * The list is hard-coded here rather than read from `.env.example`: that file does not
 * exist inside the Docker image. The `placeholder-guard.test.js` test walks
 * `.env.example` and checks that every value is still covered, so adding a new template
 * value without registering it breaks CI.
 */

/**
 * Keys whose template value must be rejected, with their known values.
 * @type {Record<string, string[]>}
 */
export const PLACEHOLDER_VALUES_BY_KEY = {
  SESSION_SECRET: ['replace-with-openssl-rand-hex-32-chars'],
  AUTH_PASS: ['change-this-password'],
  CF_API_TOKEN: ['api-example-token'],
  DOMAIN: ['example.com'],
};

/**
 * Keys from `.env.example` deliberately NOT covered.
 * `AUTH_USER=admin` is a legitimate choice and on its own grants no access: the
 * attacker would still need AUTH_PASS, which is covered. Rejecting it would only
 * annoy people who want to be called `admin`.
 */
export const PLACEHOLDER_EXEMPT_KEYS = new Set(['AUTH_USER']);

/** Below this number of distinct characters, SESSION_SECRET is trivial. */
const MIN_SESSION_SECRET_DISTINCT_CHARS = 8;

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
function readTrimmed(env, key) {
  return typeof env[key] === 'string' ? env[key].trim() : '';
}

/**
 * @param {string} value
 * @returns {number}
 */
function countDistinctChars(value) {
  return new Set(value).size;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Error message, or null when no value is a template one.
 */
export function getPlaceholderConfigurationIssue(env = process.env) {
  for (const [key, placeholders] of Object.entries(PLACEHOLDER_VALUES_BY_KEY)) {
    const value = readTrimmed(env, key);
    if (value && placeholders.includes(value)) {
      return `${key} still holds the example value from .env.example. That value is public: `
        + 'replace it with your own before starting'
        + (key === 'SESSION_SECRET' ? ' (openssl rand -hex 32).' : '.');
    }
  }

  // Minimum entropy: `openssl rand -hex 32` yields ~15-16 distinct characters, well
  // above the threshold; only trivial secrets like "aaaa…" or "abab…" get caught.
  const sessionSecret = readTrimmed(env, 'SESSION_SECRET');
  if (
    sessionSecret
    && countDistinctChars(sessionSecret) < MIN_SESSION_SECRET_DISTINCT_CHARS
  ) {
    return 'SESSION_SECRET is too predictable (it barely uses distinct characters). '
      + 'Generate a random one: openssl rand -hex 32.';
  }

  return null;
}
