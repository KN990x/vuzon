import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bootstrapDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(bootstrapDir, '..', '..');
const defaultPublicDir = path.join(srcDir, 'web', 'dist');

/**
 * Static directory served by Express.
 * `VUZON_PUBLIC_DIR` (absolute or CWD-relative path) wins; otherwise `<src root>/web/dist`
 * is derived from this module's location (independent of the CWD).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolvePublicDir(env = process.env) {
  const raw = typeof env.VUZON_PUBLIC_DIR === 'string' ? env.VUZON_PUBLIC_DIR.trim() : '';
  if (raw) {
    return path.resolve(raw);
  }
  return defaultPublicDir;
}
