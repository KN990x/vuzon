import { cloudflareResourceIdSchema } from '../shared/cloudflare-schemas.js';

const ID_ENV_KEYS = ['CF_ZONE_ID', 'CF_ACCOUNT_ID'];

/**
 * API token (trimmed). Normalized at startup (start-server.js).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getCfApiToken(env = process.env) {
  return typeof env.CF_API_TOKEN === 'string' ? env.CF_API_TOKEN.trim() : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Error message, or null when the token is present (it may be whitespace-only before normalizing).
 */
export function getCfApiTokenConfigurationIssue(env = process.env) {
  const token = getCfApiToken(env);
  if (!token) {
    return 'CF_API_TOKEN is required in .env and cannot be empty (or whitespace-only). Check the .env.example template.';
  }
  return null;
}

/**
 * @param {'CF_ZONE_ID' | 'CF_ACCOUNT_ID'} envKey
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getCloudflareResourceId(envKey, env = process.env) {
  return typeof env[envKey] === 'string' ? env[envKey].trim() : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
function cloudflareIdsValidationIssue(env) {
  for (const envKey of ID_ENV_KEYS) {
    const raw = getCloudflareResourceId(envKey, env);
    const parsed = cloudflareResourceIdSchema.safeParse(raw);
    if (!parsed.success) {
      return `${envKey} is invalid or empty. It must be a Cloudflare identifier (letters, digits, dashes and underscores, 1-64 characters). If auto-detection just ran and failed, check DOMAIN and the token, or set both IDs by hand in .env.`;
    }
  }
  return null;
}

/**
 * When both IDs are set in .env, validate their format before auto-configuration.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function getCloudflareIdsConfigurationIssueIfFullySpecified(env = process.env) {
  const zoneRaw = getCloudflareResourceId('CF_ZONE_ID', env);
  const accountRaw = getCloudflareResourceId('CF_ACCOUNT_ID', env);
  if (!zoneRaw || !accountRaw) {
    return null;
  }
  return cloudflareIdsValidationIssue(env);
}

/**
 * Checks that CF_ZONE_ID and CF_ACCOUNT_ID exist and are well-formed after auto-configuration.
 * Normalizes env by assigning the trimmed values (same pattern as CF_API_TOKEN).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertCloudflareEnvConfigured(env = process.env) {
  const issue = cloudflareIdsValidationIssue(env);
  if (issue) {
    throw new Error(issue);
  }
  env.CF_ZONE_ID = getCloudflareResourceId('CF_ZONE_ID', env);
  env.CF_ACCOUNT_ID = getCloudflareResourceId('CF_ACCOUNT_ID', env);
}
