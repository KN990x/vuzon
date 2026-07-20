import net from 'node:net';

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

/**
 * One IP or CIDR that Express will accept without throwing in `app.set('trust proxy')`.
 * A loose character-class regex used to let through values like `abc.def` that then
 * aborted startup with a cryptic TypeError — validate with `net.isIP` instead.
 * @param {string} entry
 * @returns {boolean}
 */
function isValidIpOrCidr(entry) {
  const trimmed = entry.trim();
  if (!trimmed) {
    return false;
  }

  const slash = trimmed.indexOf('/');
  const addr = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const prefixRaw = slash === -1 ? null : trimmed.slice(slash + 1);

  const family = net.isIP(addr);
  if (family === 0) {
    return false;
  }

  if (prefixRaw === null) {
    return true;
  }

  // Express rejects empty/"0x…" prefixes; require a plain decimal integer in range.
  if (!/^\d+$/.test(prefixRaw)) {
    return false;
  }
  const prefix = Number.parseInt(prefixRaw, 10);
  const max = family === 4 ? 32 : 128;
  // Express (proxy-addr) throws on /0: "invalid range on address".
  return prefix >= 1 && prefix <= max;
}

/**
 * @param {string} original
 * @returns {boolean}
 */
function isValidIpOrCidrList(original) {
  const parts = original.split(',');
  if (parts.length === 0) {
    return false;
  }
  return parts.every((part) => isValidIpOrCidr(part));
}

/**
 * Value for `app.set('trust proxy', …)`.
 *
 * Besides the documented hop count (`1`, `2`, …) we accept the forms Express understands
 * that used to fall back to `false` silently: `loopback`, `linklocal`, `uniquelocal` and
 * IP/CIDR lists. An unrecognized value still returns `false` (the safe position), but now
 * it is logged: silently, the rate limit would end up grouping everyone under the proxy's
 * IP with nobody noticing. Each IP/CIDR entry is validated with `net.isIP` so a typo
 * cannot throw inside Express at startup.
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

  if (isValidIpOrCidrList(original)) {
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

export function getServerRuntime(env = process.env, { warn = console.warn } = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const cookieSecure = parseCookieSecure(env.COOKIE_SECURE);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY, { warn });

  // Trusting the proxy means `X-Forwarded-For` decides the rate-limit key. With no TLS
  // termination in front (the reliable signal for that is COOKIE_SECURE being off), the
  // header is attacker-controlled and the login limiter can be bypassed one forged IP at
  // a time — that is, silently no anti-brute-force at all. Same reasoning as the warning
  // in parseTrustProxy: a security setting that quietly does nothing is the worst kind.
  if (trustProxy !== false && !cookieSecure) {
    warn(
      'TRUST_PROXY is enabled but COOKIE_SECURE is not. If the panel is reachable without '
        + 'a TLS-terminating reverse proxy in front, X-Forwarded-For can be spoofed and the '
        + 'login rate limit bypassed. Set COOKIE_SECURE=1 behind TLS, or unset TRUST_PROXY.',
    );
  }

  return {
    port: getListenPort(env),
    isProduction,
    cookieSecure,
    trustProxy,
  };
}
