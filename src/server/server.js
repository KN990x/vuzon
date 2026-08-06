import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { startServer } from './bootstrap/start-server.js';

/**
 * Load the repo-root `.env` — in development only.
 *
 * The path is resolved relative to this file rather than to cwd, because `pnpm --filter`
 * runs from `src/server/`. In the Docker image, though, `pnpm deploy` flattens the bundle
 * so this file sits at `/app/server.js`: `../..` resolved to `/`, and the process opened
 * `/.env` on every boot. There is no repo root in the image, the configuration arrives
 * through `env_file`/`environment`, and reading an arbitrary dotfile from the filesystem
 * root is not something a production container should be doing at all.
 *
 * `existsSync` rather than `NODE_ENV`: it is the condition that actually matters (is there
 * a repo-root .env to read?), and it keeps working for anyone running the backend directly
 * with NODE_ENV=production set for other reasons.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(repoRoot, '.env');
if (repoRoot !== path.parse(repoRoot).root && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

startServer();
