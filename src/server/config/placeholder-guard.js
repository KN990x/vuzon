/**
 * Rejection of the filler values shipped in `.env.example`.
 *
 * Why: `.env.example` lives in a public repository. A template value that passes the
 * normal validations is a secret everybody knows — `CF_API_TOKEN` most of all, since it
 * is the one credential in the file that still grants access to something.
 *
 * The worst case used to be `SESSION_SECRET`: the `vuzon_session` cookie is signed (not
 * encrypted), so a published signing key let anyone forge `{ authenticated: true }`
 * without ever meeting the login limiter. That whole class of mistake is gone — the key is
 * no longer an environment variable at all, it is generated into the data directory (see
 * `config/session-secret.js`). This guard covers what is left.
 *
 * The list is hard-coded here rather than read from `.env.example`: that file does not
 * exist inside the Docker image. `placeholder-guard.test.js` walks `.env.example` and
 * checks that every value is still covered, so adding a new template value without
 * registering it breaks CI. It also asserts that the secret-bearing keys keep shipping
 * empty and that every entry below is still rejected — otherwise the walk has nothing to
 * inspect and this list quietly becomes dead code.
 */

/**
 * Keys whose template value must be rejected, with their known values.
 * @type {Record<string, string[]>}
 */
export const PLACEHOLDER_VALUES_BY_KEY = {
  CF_API_TOKEN: ['api-example-token'],
  DOMAIN: ['example.com'],
};

/**
 * Keys from `.env.example` deliberately NOT covered.
 * Empty since the panel credentials stopped being environment variables (they are chosen
 * in the setup wizard and stored hashed); the set stays because the walk in
 * `placeholder-guard.test.js` still consults it whenever a new template value appears.
 */
export const PLACEHOLDER_EXEMPT_KEYS = new Set();

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
function readTrimmed(env, key) {
  return typeof env[key] === 'string' ? env[key].trim() : '';
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
        + 'replace it with your own before starting.';
    }
  }

  return null;
}
