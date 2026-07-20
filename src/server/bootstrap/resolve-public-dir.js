import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bootstrapDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(bootstrapDir, '..', '..');
const defaultPublicDir = path.join(srcDir, 'web', 'dist');

/**
 * Directorio de estáticos servidos por Express.
 * `VUZON_PUBLIC_DIR` (ruta absoluta o relativa al CWD) tiene prioridad; si no, se usa
 * `<raíz de src>/web/dist` según la ubicación de este módulo (independiente del CWD).
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
