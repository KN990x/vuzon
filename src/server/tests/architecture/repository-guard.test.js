import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(architectureDir, '..', '..'); // src/server (@vuzon/server)
const repoRoot = path.join(serverDir, '..', '..'); // workspace root

test('tree: the server entrypoint and bootstrap exist', () => {
  assert.ok(fs.existsSync(path.join(serverDir, 'server.js')));
  assert.ok(fs.existsSync(path.join(serverDir, 'bootstrap', 'create-app.js')));
  assert.ok(fs.existsSync(path.join(serverDir, 'bootstrap', 'start-server.js')));
});

test('tree: shared schemas in src/server/shared', () => {
  assert.ok(fs.existsSync(path.join(serverDir, 'shared', 'cloudflare-schemas.js')));
});

test('tree: the web package lives in src/web', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'web', 'package.json')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'web', 'vite.config.ts')));
});

test('package: native pnpm workspace (single lockfile + packageManager, no package-lock)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.packageManager ?? '', /^pnpm@/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')));
  assert.equal(fs.existsSync(path.join(repoRoot, 'package-lock.json')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'yarn.lock')), false);
  // Unified-workspace invariant: the frontend no longer has its own lockfile.
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'web', 'pnpm-lock.yaml')), false);
});

function readJsonFile(...segments) {
  return JSON.parse(fs.readFileSync(path.join(...segments), 'utf8'));
}

test('package: the version does not drift between the root and the two workspace packages', () => {
  const root = readJsonFile(repoRoot, 'package.json');
  const server = readJsonFile(serverDir, 'package.json');
  const web = readJsonFile(repoRoot, 'src', 'web', 'package.json');

  assert.equal(server.version, root.version);
  assert.equal(web.version, root.version);
});

test('tree: no leftovers from the workspace migration', () => {
  // The HTTP contract lives in tests/integration/server/app.test.js, not in a separate .md.
  assert.equal(fs.existsSync(path.join(repoRoot, 'API_CONTRACT.md')), false);
  // create-vite README boilerplate: deleted once everything was documented in CONTRIBUTING.md.
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'web', 'README.md')), false);
  // A root-level `public/` got confused with VUZON_PUBLIC_DIR; images live in docs/.
  assert.equal(fs.existsSync(path.join(repoRoot, 'public')), false);
  assert.ok(fs.existsSync(path.join(repoRoot, 'docs', 'assets', 'logo.svg')));
});

test('brand: the favicon uses the panel amber, not another brand palette', () => {
  const faviconPath = path.join(repoRoot, 'src', 'web', 'public', 'favicon.svg');
  const favicon = fs.readFileSync(faviconPath, 'utf8');
  const theme = fs.readFileSync(path.join(repoRoot, 'src', 'web', 'src', 'index.css'), 'utf8');

  // The favicon's accent must be the same token the UI uses.
  const accent = theme.match(/--color-accent:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(accent, 'could not read --color-accent from index.css');
  assert.ok(
    favicon.toLowerCase().includes(accent.toLowerCase()),
    `favicon.svg should use the theme accent (${accent}).`,
  );

  // Regression: the original favicon was violet/cyan, from another brand.
  for (const foreign of ['#863bff', '#7e14ff', '#47bfff']) {
    assert.equal(
      favicon.toLowerCase().includes(foreign),
      false,
      `favicon.svg contains ${foreign}, which is not part of the vuzon palette.`,
    );
  }
});

test('brand: the three copies of the mailbox cannot diverge', () => {
  // The mark lives in three places and all of them are vector on purpose: that way they
  // can be compared against each other and CI catches any drift. The favicon is canonical.
  const faviconPath = path.join(repoRoot, 'src', 'web', 'public', 'favicon.svg');
  const favicon = fs.readFileSync(faviconPath, 'utf8');

  const copies = {
    'docs/assets/logo.svg': path.join(repoRoot, 'docs', 'assets', 'logo.svg'),
    'VuzonMark (primitives.tsx)': path.join(
      repoRoot, 'src', 'web', 'src', 'components', 'primitives.tsx',
    ),
  };

  const shapes = [...favicon.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(shapes.length >= 2, 'expected the mailbox strokes in favicon.svg');

  for (const [label, copyPath] of Object.entries(copies)) {
    const copy = fs.readFileSync(copyPath, 'utf8');
    for (const shape of shapes) {
      assert.ok(
        copy.includes(shape),
        `${label} no longer shares geometry with favicon.svg. `
          + 'Update all three copies so the mark stays a single one.',
      );
    }
  }
});

test('frontend: public/ does not accumulate orphan assets', () => {
  // icons.svg (Bluesky, Discord, X…) was left over from the previous version and nobody
  // referenced it, yet it was copied into dist/ and served.
  const publicDir = path.join(repoRoot, 'src', 'web', 'public');
  assert.deepEqual(fs.readdirSync(publicDir).sort(), ['favicon.svg']);
});

test('frontend: no framer-motion (the Toast animates with CSS)', () => {
  const web = readJsonFile(repoRoot, 'src', 'web', 'package.json');
  const declared = { ...web.dependencies, ...web.devDependencies };
  assert.equal(Object.hasOwn(declared, 'framer-motion'), false);
});
