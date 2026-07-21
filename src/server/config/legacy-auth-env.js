/** @type {readonly string[]} */
export const LEGACY_AUTH_ENV_KEYS = Object.freeze([
  'AUTH_USER',
  'AUTH_PASS',
  'SESSION_SECRET',
]);

/**
 * Warn when 1.x panel-auth variables are still present. They are ignored in 2.0: credentials
 * live in auth.json and the session signing key in the data directory.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ warn?: (message: string) => void }} [opts]
 */
export function warnIfLegacyAuthEnvVarsSet(env = process.env, { warn = console.warn } = {}) {
  const set = LEGACY_AUTH_ENV_KEYS.filter(
    (key) => typeof env[key] === 'string' && env[key].trim() !== '',
  );
  if (set.length === 0) {
    return;
  }

  const listed = set.join(', ');
  const verb = set.length === 1 ? 'is' : 'are';
  warn(
    `${listed} ${verb} set but ignored since v2.0. `
      + 'Panel credentials and the session signing key live in the data directory now '
      + '(see VUZON_DATA_DIR). Remove them from your .env.',
  );
}
