import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const storageDir = path.dirname(fileURLToPath(import.meta.url));
// src/server/platform/storage → src/server/platform → src/server → src → repo root
const defaultDataDir = path.join(storageDir, '..', '..', '..', '..', 'data');

/** Owner-only: the directory holds the credential hash and the session signing key. */
const DATA_DIR_MODE = 0o700;

/**
 * Writable directory where the panel keeps its own state (credentials, session secret).
 *
 * `VUZON_DATA_DIR` (absolute or CWD-relative) wins; otherwise `<repo root>/data`, derived
 * from this module's location so it does not depend on the CWD. The Docker image sets the
 * variable explicitly (`/app/data`), where a volume must be mounted.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveDataDir(env = process.env) {
  const raw = typeof env.VUZON_DATA_DIR === 'string' ? env.VUZON_DATA_DIR.trim() : '';
  if (raw) {
    return path.resolve(raw);
  }
  return defaultDataDir;
}

/**
 * Creates the data directory if needed and checks it can be written to.
 *
 * This runs at startup, next to the other configuration checks: a volume that was never
 * mounted (or mounted read-only) must abort the boot with an actionable message instead of
 * failing on the first POST of the setup wizard, when the user is already looking at a form.
 *
 * @param {string} dataDir
 * @returns {string | null} Error message, or null when the directory is usable.
 */
export function getDataDirConfigurationIssue(dataDir) {
  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: DATA_DIR_MODE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `The data directory ${dataDir} could not be created (${message}). `
      + 'Mount a writable volume there, or point VUZON_DATA_DIR somewhere else.';
  }

  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch {
    return `The data directory ${dataDir} is not writable. The panel stores your credentials `
      + 'there, so it needs write access (in Docker: mount a volume on it).';
  }

  return null;
}
