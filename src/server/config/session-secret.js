import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '../platform/storage/data-dir.js';

const SECRET_FILE_NAME = 'session-secret';

/** Owner-only: whoever reads this file can forge a logged-in cookie. */
const FILE_MODE = 0o600;

/**
 * @param {string} filePath
 * @returns {string} Empty string when the file is missing or holds nothing usable.
 */
function readSecretFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return '';
    }
    throw new Error(`The session secret file ${filePath} could not be read: ${err.message}`);
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function createSecretFile(filePath) {
  const secret = crypto.randomBytes(32).toString('hex');
  // Unique temp name: a shared `${filePath}.tmp` let one process rmSync the file another
  // had just written, so its renameSync threw ENOENT and aborted startup.
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  // Same reasoning as session-epoch.js and credential-store.js: the data dir is validated
  // at startup, but all three writers into it should behave alike if it disappears later.
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(tmpPath, `${secret}\n`, { mode: FILE_MODE });
    fs.chmodSync(tmpPath, FILE_MODE);
    // link() is atomic AND fails with EEXIST instead of overwriting, unlike rename(): two
    // processes racing on a fresh data directory must end up with the SAME key, otherwise
    // the loser keeps signing cookies that the file on disk can no longer validate.
    try {
      fs.linkSync(tmpPath, filePath);
      return secret;
    } catch (err) {
      if (err?.code !== 'EEXIST') {
        throw err;
      }
    }

    // Something is already there. If it holds a usable key, another process won the race
    // and we adopt its key. If it is empty (interrupted first boot, badly restored volume)
    // it is not a competitor, so overwrite it — rename() replaces unconditionally.
    const existing = readSecretFile(filePath);
    if (existing) {
      return existing;
    }
    fs.renameSync(tmpPath, filePath);
    return secret;
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/**
 * Secret used to sign the session cookie.
 *
 * It is generated once into the data directory and reused from then on. There is **no
 * environment variable**: the panel already needs a writable data directory for its
 * credentials, so asking the user to paste `openssl rand -hex 32` into `.env` bought
 * nothing but one more line to get wrong — a published template value, a 12-character
 * "secret", or the old ephemeral fallback that logged everyone out on every restart.
 *
 * A file that exists but is empty (an interrupted first boot, a volume restored badly) is
 * treated as missing and regenerated: the only cost is that current sessions stop being
 * valid, which is exactly what should happen when the signing key is gone.
 *
 * @param {{ env?: NodeJS.ProcessEnv, dataDir?: string }} [opts]
 * @returns {string}
 */
export function resolveSessionSecret({ env = process.env, dataDir = resolveDataDir(env) } = {}) {
  const filePath = path.join(dataDir, SECRET_FILE_NAME);
  return readSecretFile(filePath) || createSecretFile(filePath);
}
