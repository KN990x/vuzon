import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { startServer } from './bootstrap/start-server.js';

// Always load the repo-root `.env`, not cwd (pnpm --filter runs from src/server/).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

startServer();
