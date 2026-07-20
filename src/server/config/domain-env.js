/**
 * Dominio del panel (trim). Usado en reglas de correo y /api/me.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getPanelDomain(env = process.env) {
  return typeof env.DOMAIN === 'string' ? env.DOMAIN.trim() : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Mensaje de error o null si la configuración es válida.
 */
export function getDomainConfigurationIssue(env = process.env) {
  if (!getPanelDomain(env)) {
    return 'DOMAIN es obligatorio en .env y no puede estar vacío (ni solo espacios). Debe ser el dominio raíz en Cloudflare (ej. ejemplo.com).';
  }
  return null;
}
