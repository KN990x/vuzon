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

/** Predefined range names Express accepts in `trust proxy`. */
const EXPRESS_TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** IPv4/IPv6 with optional CIDR, or a comma-separated list. Express takes these as-is. */
const IP_OR_CIDR_LIST_REGEX = /^[0-9a-f.:/]+(?:\s*,\s*[0-9a-f.:/]+)*$/i;

/**
 * Value for `app.set('trust proxy', …)`.
 *
 * Besides the documented hop count (`1`, `2`, …) we accept the forms Express understands
 * that used to fall back to `false` silently: `loopback`, `linklocal`, `uniquelocal` and
 * IP/CIDR lists. An unrecognized value still returns `false` (the safe position), but now
 * it is logged: silently, the rate limit would end up grouping everyone under the proxy's
 * IP with nobody noticing.
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
    `TRUST_PROXY="${original}" is not recognized and is ignored (trust proxy stays off). `
      + 'Use a hop count (1, 2, …), "loopback"/"linklocal"/"uniquelocal", '
      + 'or an IP/CIDR list.',
  );
  return false;
}

/**
 * Listen port: `PORT` wins over `VUZON_PORT`.
 * In Docker Compose the service usually sets `PORT` inside the container; `VUZON_PORT` in
 * `.env` often only feeds the host's `ports` mapping (see docker-compose.yml).
 * Empty (whitespace-only) values are ignored. `0` is valid (ephemeral port in Node).
 * Out of range or non-integer falls back to 8001: `listen` would otherwise fail with a much
 * more cryptic error (`ERR_SOCKET_BAD_PORT`) right at the end of startup.
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
