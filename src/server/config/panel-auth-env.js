/**
 * Normalized (trimmed) panel credentials.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ authUser: string, authPass: string }}
 */
export function getPanelAuthCredentials(env = process.env) {
  const authUser = typeof env.AUTH_USER === 'string' ? env.AUTH_USER.trim() : '';
  const authPass = typeof env.AUTH_PASS === 'string' ? env.AUTH_PASS.trim() : '';
  return { authUser, authPass };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Error message, or null when the configuration is valid.
 */
export function getPanelAuthConfigurationIssue(env = process.env) {
  const { authUser, authPass } = getPanelAuthCredentials(env);
  if (!authUser || !authPass) {
    return 'AUTH_USER and AUTH_PASS are required in .env and cannot be empty (or whitespace-only). Check the .env.example template.';
  }
  return null;
}
