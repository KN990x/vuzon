#!/usr/bin/env node
// `pnpm run setup`: takes a fresh clone to "ready for `pnpm dev`" on a new machine.
// Idempotent: run it as often as you like, it never overwrites a file you already have.
//
//   1. Node against `.nvmrc` (mise installs it) and pnpm against `packageManager` (Corepack).
//   2. `pnpm install --frozen-lockfile` for the whole workspace.
//   3. Copies every tracked `*.example` to its local name ONLY if that file does not exist yet,
//      then lists by name the keys of `.env` that are still empty. Values are never printed:
//      `.env` holds the Cloudflare token.
//
// Nothing else needs preparing: there is no database, and the panel creates its own state in
// `VUZON_DATA_DIR` (`./data`) on first start.
//
// Usage: pnpm run setup   (or `node scripts/setup.mjs`)

import { execFileSync, spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

const missing = [];
const ok = (msg) => console.log(`[setup] ✓ ${msg}`);
const fail = (msg) => {
  console.log(`[setup] ✗ ${msg}`);
  missing.push(msg);
};
const abort = (msg) => {
  console.error(`[setup] ✗ ${msg}`);
  process.exit(1);
};

/** Stdout of a command, or null when it is missing or fails. */
function output(bin, args) {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Major of `v26.1.0`, `26` or `11.14.0`. */
function major(text) {
  const m = /(\d+)/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Names of the active (uncommented) keys with an empty value. Only names leave this function,
 * never a value.
 */
function emptyKeys(dotenvText) {
  const keys = [];
  for (const line of dotenvText.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value === '') keys.push(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------- 1. toolchain
const nvmrc = readFileSync('.nvmrc', 'utf8').trim();
if (major(process.version) !== major(nvmrc)) {
  abort(
    `Node ${process.version}, but .nvmrc asks for ${nvmrc}. Install it and run setup again:\n` +
      '    mise install && pnpm run setup'
  );
}
ok(`Node ${process.version} (.nvmrc: ${nvmrc})`);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const wantedPnpm = String(pkg.packageManager ?? '').replace(/^pnpm@/, '');
const currentPnpm = output('pnpm', ['--version']);
if (currentPnpm !== wantedPnpm) {
  abort(
    `pnpm ${currentPnpm ?? '(not found)'}, but packageManager asks for ${wantedPnpm}. With Corepack:\n` +
      '    npm install -g corepack@latest && corepack enable && corepack install && pnpm run setup'
  );
}
ok(`pnpm ${currentPnpm} (packageManager)`);

// ---------------------------------------------------------------- 2. dependencies
if (spawnSync('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' }).status !== 0) {
  abort('`pnpm install --frozen-lockfile` failed: see the error above.');
}
ok('dependencies installed (frozen lockfile)');

// ---------------------------------------------------------------- 3. environment files
const examples = (output('git', ['ls-files', '*.example']) ?? '').split('\n').filter(Boolean);
for (const example of examples) {
  const target = example.replace(/\.example$/, '');
  if (existsSync(target)) {
    ok(`${target} already exists (left untouched)`);
    continue;
  }
  copyFileSync(example, target, constants.COPYFILE_EXCL);
  ok(`${target} created from ${example}`);
}

let toFill = [];
if (existsSync('.env')) {
  toFill = emptyKeys(readFileSync('.env', 'utf8'));
  if (toFill.length) fail(`.env: fill in ${toFill.join(', ')} (see the comments in .env.example)`);
  else ok('.env has no empty keys');
} else {
  fail('.env is missing: copy .env.example to .env');
}

// ---------------------------------------------------------------- summary
console.log('');
if (missing.length) {
  for (const m of missing) console.log(`[setup] To do: ${m}`);
  console.log(
    '[setup] Next: edit .env by hand, then `pnpm dev` (API on :8001, panel on :5173). ' +
      'Running `pnpm run setup` again is safe.'
  );
} else {
  console.log('[setup] ✅ Ready. Next: `pnpm dev` (API on :8001, panel on :5173).');
}
