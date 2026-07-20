import { cloudflareResourceIdSchema } from '../shared/cloudflare-schemas.js';

const ID_ENV_KEYS = ['CF_ZONE_ID', 'CF_ACCOUNT_ID'];

/**
 * Token de API (trim). Se normaliza en el arranque (start-server.js).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getCfApiToken(env = process.env) {
  return typeof env.CF_API_TOKEN === 'string' ? env.CF_API_TOKEN.trim() : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Mensaje de error o null si el token está presente (puede incluir solo espacios antes de normalizar).
 */
export function getCfApiTokenConfigurationIssue(env = process.env) {
  const token = getCfApiToken(env);
  if (!token) {
    return 'CF_API_TOKEN es obligatorio en .env y no puede estar vacío (ni solo espacios). Revisa la plantilla .env.example.';
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
      return `${envKey} no válido o vacío. Debe ser un identificador Cloudflare (letras, números, guiones y guión bajo, 1-64 caracteres). Si acabas de autodetectar y falla, revisa DOMAIN y el token, o define ambos IDs a mano en .env.`;
    }
  }
  return null;
}

/**
 * Si ambos IDs están definidos en .env, valida formato antes de la autoconfiguración.
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
 * Comprueba que CF_ZONE_ID y CF_ACCOUNT_ID existan y tengan formato válido tras autoconfiguración.
 * Normaliza env asignando los valores sin espacios laterales (mismo patrón que CF_API_TOKEN).
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
