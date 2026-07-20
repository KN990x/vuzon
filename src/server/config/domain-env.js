/**
 * Panel domain (trimmed). Used in email rules and /api/me.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getPanelDomain(env = process.env) {
  return typeof env.DOMAIN === 'string' ? env.DOMAIN.trim() : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Error message, or null when the configuration is valid.
 */
export function getDomainConfigurationIssue(env = process.env) {
  if (!getPanelDomain(env)) {
    return 'DOMAIN is required in .env and cannot be empty (or whitespace-only). It must be the root domain in Cloudflare (e.g. example.com).';
  }
  return null;
}
