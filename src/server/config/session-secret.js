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
  const tmpPath = `${filePath}.tmp`;
  fs.rmSync(tmpPath, { force: true });
  fs.writeFileSync(tmpPath, `${secret}\n`, { mode: FILE_MODE });
  fs.chmodSync(tmpPath, FILE_MODE);
  // rename() is atomic within a filesystem: two processes racing on a fresh data
  // directory cannot leave a half-written key behind.
  fs.renameSync(tmpPath, filePath);
  return secret;
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
