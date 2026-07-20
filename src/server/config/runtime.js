/**
 * Opt-in for Secure session cookies (HTTPS / TLS-terminating proxy).
 * Homelab HTTP stays usable when unset. Accepts 1/true/yes (case-insensitive).
 * @param {string | undefined} raw
 * @returns {boolean}
 */
export function parseCookieSecure(raw) {
  if (raw === undefined || raw === '') {
    return false;
  }
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/** Nombres de rango predefinidos que Express acepta en `trust proxy`. */
const EXPRESS_TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** IPv4/IPv6 con CIDR opcional, o una lista separada por comas. Express los admite tal cual. */
const IP_OR_CIDR_LIST_REGEX = /^[0-9a-f.:/]+(?:\s*,\s*[0-9a-f.:/]+)*$/i;

/**
 * Valor para `app.set('trust proxy', …)`.
 *
 * Además del contador de saltos documentado (`1`, `2`, …) se aceptan las formas que
 * Express entiende y que antes caían a `false` en silencio: `loopback`, `linklocal`,
 * `uniquelocal` y listas de IP/CIDR. Un valor irreconocible sigue devolviendo `false`
 * (posición segura), pero ahora deja constancia: en silencio, el rate limit acabaría
 * agrupando a todo el mundo bajo la IP del proxy sin que nadie se entere.
 *
 * @param {string | undefined} raw
 * @param {{ warn?: (message: string) => void }} [opts]
 * @returns {boolean | number | string}
 */
export function parseTrustProxy(raw, { warn = console.warn } = {}) {
  if (raw === undefined || raw === '') {
    return false;
  }

  const original = String(raw).trim();
  const s = original.toLowerCase();
  if (s === '') {
    return false;
  }
  if (s === 'false' || s === '0' || s === 'no') {
    return false;
  }
  if (s === 'true' || s === 'yes' || s === '1') {
    return 1;
  }

  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10);
    return n === 0 ? false : n;
  }

  if (EXPRESS_TRUST_PROXY_KEYWORDS.has(s)) {
    return s;
  }

  if (IP_OR_CIDR_LIST_REGEX.test(original) && /[.:]/.test(original)) {
    return original;
  }

  warn(
    `TRUST_PROXY="${original}" no se reconoce y se ignora (trust proxy queda desactivado). `
      + 'Usa un número de saltos (1, 2, …), "loopback"/"linklocal"/"uniquelocal", '
      + 'o una lista de IP/CIDR.',
  );
  return false;
}

/**
 * Puerto de escucha: `PORT` tiene prioridad sobre `VUZON_PORT`.
 * En Docker Compose el servicio suele fijar `PORT` dentro del contenedor; `VUZON_PORT` en `.env`
 * a menudo solo alimenta el mapeo `ports` del host (ver docker-compose.yml).
 * Valores vacíos (solo espacios) se ignoran. `0` es válido (puerto efímero en Node).
 * Fuera de rango o no entero se cae a 8001: `listen` fallaría con un error mucho más
 * críptico (`ERR_SOCKET_BAD_PORT`) justo al final del arranque.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function getListenPort(env = process.env) {
  let raw;
  if (env.PORT !== undefined && String(env.PORT).trim() !== '') {
    raw = env.PORT;
  } else if (env.VUZON_PORT !== undefined && String(env.VUZON_PORT).trim() !== '') {
    raw = env.VUZON_PORT;
  }
  if (raw === undefined) {
    return 8001;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    return 8001;
  }
  return n;
}

export function getServerRuntime(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';

  return {
    port: getListenPort(env),
    isProduction,
    cookieSecure: parseCookieSecure(env.COOKIE_SECURE),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}
