/**
 * Rechazo de los valores de relleno de `.env.example`.
 *
 * Motivo: `.env.example` vive en un repositorio público. Un valor de plantilla que
 * pase las validaciones normales es un secreto conocido por todo el mundo. El caso
 * grave es SESSION_SECRET: la cookie `vuzon_session` está firmada (no cifrada), así
 * que con la clave publicada cualquiera puede fabricar `{ authenticated: true }` y
 * entrar sin credenciales, sin pasar siquiera por el limiter de login.
 *
 * La lista se codifica aquí, no se lee de `.env.example`: ese fichero no existe
 * dentro de la imagen Docker. El test `placeholder-guard.test.js` recorre
 * `.env.example` y comprueba que cada valor sigue estando cubierto, de modo que
 * añadir una plantilla nueva sin registrarla rompe CI.
 */

/**
 * Claves cuyo valor de plantilla debe rechazarse, con sus valores conocidos.
 * @type {Record<string, string[]>}
 */
export const PLACEHOLDER_VALUES_BY_KEY = {
  SESSION_SECRET: ['replace-with-openssl-rand-hex-32-chars'],
  AUTH_PASS: ['change-this-password'],
  CF_API_TOKEN: ['api-example-token'],
  DOMAIN: ['example.com'],
};

/**
 * Claves de `.env.example` deliberadamente NO cubiertas.
 * `AUTH_USER=admin` es una elección legítima y por sí sola no da acceso a nada:
 * el atacante seguiría necesitando AUTH_PASS, que sí está cubierto. Rechazarlo
 * solo molestaría a quien quiere llamarse `admin`.
 */
export const PLACEHOLDER_EXEMPT_KEYS = new Set(['AUTH_USER']);

/** Por debajo de este número de caracteres distintos, SESSION_SECRET es trivial. */
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
 * @returns {string | null} Mensaje de error, o null si ningún valor es de plantilla.
 */
export function getPlaceholderConfigurationIssue(env = process.env) {
  for (const [key, placeholders] of Object.entries(PLACEHOLDER_VALUES_BY_KEY)) {
    const value = readTrimmed(env, key);
    if (value && placeholders.includes(value)) {
      return `${key} conserva el valor de ejemplo de .env.example. Ese valor es público: `
        + 'cámbialo por uno propio antes de arrancar'
        + (key === 'SESSION_SECRET' ? ' (openssl rand -hex 32).' : '.');
    }
  }

  // Entropía mínima: `openssl rand -hex 32` produce ~15-16 caracteres distintos,
  // muy por encima del umbral; solo caen secretos triviales tipo "aaaa…" o "abab…".
  const sessionSecret = readTrimmed(env, 'SESSION_SECRET');
  if (
    sessionSecret
    && countDistinctChars(sessionSecret) < MIN_SESSION_SECRET_DISTINCT_CHARS
  ) {
    return 'SESSION_SECRET es demasiado predecible (apenas usa caracteres distintos). '
      + 'Genera uno aleatorio: openssl rand -hex 32.';
  }

  return null;
}
