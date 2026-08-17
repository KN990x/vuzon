#!/usr/bin/env node
// Writes one semver into all three workspace manifests at once.
//
// Two releases in a row (v2.0.1, v2.0.2) were tagged from a tree that still carried the
// previous version, and the GHCR publish guard rejected both — bumping was three separate
// hand edits, and the whole step was simply forgotten. One command makes it hard to skip.
//
// It only edits the working tree: no commit, no tag, no push. Cutting a release stays an
// explicit decision, and the diff is reviewable before anything leaves the machine.
//
// Usage: node scripts/release-prep.mjs <version>   (e.g. 2.0.2, without the leading "v")

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// repository-guard.test.js asserts these three never drift, so they always move together.
const MANIFESTS = ['package.json', 'src/server/package.json', 'src/web/package.json'];

const SEMVER = /^\d+\.\d+\.\d+$/;

/** The workflow compares `${RELEASE_TAG#v}` against package.json, so the "v" is not ours. */
function parseVersionArg(argv) {
  const [version, ...extra] = argv;
  if (!version) usage('missing <version> argument');
  if (extra.length > 0) usage(`unexpected extra arguments: ${extra.join(' ')}`);
  if (version.startsWith('v')) usage(`pass the version without the leading "v": ${version.slice(1)}`);
  if (!SEMVER.test(version)) usage(`"${version}" is not a MAJOR.MINOR.PATCH version`);
  return version;
}

function usage(problem) {
  console.error(`release-prep: ${problem}`);
  console.error('Usage: node scripts/release-prep.mjs <version>   (e.g. 2.0.2)');
  process.exit(1);
}

/**
 * Rewrites the version in place instead of re-serialising the parsed object: a
 * JSON.stringify round trip would reformat whatever the file happens to look like, and the
 * point of this script is a one-line diff per manifest.
 */
function setVersion(relativePath, version) {
  const path = join(repoRoot, relativePath);
  const text = readFileSync(path, 'utf8');
  const current = JSON.parse(text).version;

  if (current === undefined) {
    throw new Error(`${relativePath} has no "version" field`);
  }

  // Dependency ranges are `"name": "^1.2.3"`, so the *key* "version" appears exactly once in
  // a well-formed manifest. More than one means the file grew a shape this script cannot
  // safely edit, and guessing which occurrence is the package version would be worse.
  const declarations = text.match(/"version"\s*:/g) ?? [];
  if (declarations.length !== 1) {
    throw new Error(`${relativePath} declares "version" ${declarations.length} times; edit it by hand`);
  }

  if (current === version) return false;

  const updated = text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  writeFileSync(path, updated);
  return true;
}

const version = parseVersionArg(process.argv.slice(2));

for (const manifest of MANIFESTS) {
  const changed = setVersion(manifest, version);
  console.log(`${changed ? 'updated' : 'unchanged'}  ${manifest} → ${version}`);
}

console.log(`\nAll three manifests are at ${version}. Next: pnpm run check, commit, then tag v${version}.`);
