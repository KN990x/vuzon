import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(architectureDir, '..', '..'); // src/server (@vuzon/server)
const repoRoot = path.join(serverDir, '..', '..'); // raíz del workspace

test('árbol: entrypoint del servidor y bootstrap existen', () => {
  assert.ok(fs.existsSync(path.join(serverDir, 'server.js')));
  assert.ok(fs.existsSync(path.join(serverDir, 'bootstrap', 'create-app.js')));
  assert.ok(fs.existsSync(path.join(serverDir, 'bootstrap', 'start-server.js')));
});

test('árbol: esquemas compartidos en src/server/shared', () => {
  assert.ok(fs.existsSync(path.join(serverDir, 'shared', 'cloudflare-schemas.js')));
});

test('árbol: el paquete web vive en src/web', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'web', 'package.json')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'web', 'vite.config.ts')));
});

test('paquete: workspace pnpm nativo (lockfile único + packageManager, sin package-lock)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.packageManager ?? '', /^pnpm@/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')));
  assert.equal(fs.existsSync(path.join(repoRoot, 'package-lock.json')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'yarn.lock')), false);
  // Invariante del workspace unificado: el frontend ya no tiene su propio lockfile.
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'web', 'pnpm-lock.yaml')), false);
});

function readJsonFile(...segments) {
  return JSON.parse(fs.readFileSync(path.join(...segments), 'utf8'));
}

test('paquete: la versión no deriva entre la raíz y los dos paquetes del workspace', () => {
  const root = readJsonFile(repoRoot, 'package.json');
  const server = readJsonFile(serverDir, 'package.json');
  const web = readJsonFile(repoRoot, 'src', 'web', 'package.json');

  assert.equal(server.version, root.version);
  assert.equal(web.version, root.version);
});

test('árbol: sin residuos de la migración a workspace', () => {
  // El contrato HTTP vive en tests/integration/server/app.test.js, no en un .md aparte.
  assert.equal(fs.existsSync(path.join(repoRoot, 'API_CONTRACT.md')), false);
  // README boilerplate de create-vite: se borró al documentar todo en CONTRIBUTING.md.
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'web', 'README.md')), false);
  // `public/` en la raíz se confundía con VUZON_PUBLIC_DIR; las imágenes viven en docs/.
  assert.equal(fs.existsSync(path.join(repoRoot, 'public')), false);
  assert.ok(fs.existsSync(path.join(repoRoot, 'docs', 'assets', 'logo.svg')));
});

test('marca: el favicon usa el ámbar del panel, no la paleta de otra marca', () => {
  const faviconPath = path.join(repoRoot, 'src', 'web', 'public', 'favicon.svg');
  const favicon = fs.readFileSync(faviconPath, 'utf8');
  const theme = fs.readFileSync(path.join(repoRoot, 'src', 'web', 'src', 'index.css'), 'utf8');

  // El acento del favicon debe ser el mismo token que usa la UI.
  const accent = theme.match(/--color-accent:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(accent, 'no se pudo leer --color-accent de index.css');
  assert.ok(
    favicon.toLowerCase().includes(accent.toLowerCase()),
    `favicon.svg debería usar el acento del tema (${accent}).`,
  );

  // Regresión: el favicon original era violeta/cian de otra marca.
  for (const foreign of ['#863bff', '#7e14ff', '#47bfff']) {
    assert.equal(
      favicon.toLowerCase().includes(foreign),
      false,
      `favicon.svg contiene ${foreign}, que no pertenece a la paleta de vuzon.`,
    );
  }
});

test('marca: las tres copias del buzón no pueden divergir', () => {
  // La marca vive en tres sitios y todos son vectoriales a propósito: así se pueden
  // comparar entre sí y CI detecta cualquier desvío. El favicon es la copia canónica.
  const faviconPath = path.join(repoRoot, 'src', 'web', 'public', 'favicon.svg');
  const favicon = fs.readFileSync(faviconPath, 'utf8');

  const copies = {
    'docs/assets/logo.svg': path.join(repoRoot, 'docs', 'assets', 'logo.svg'),
    'VuzonMark (primitives.tsx)': path.join(
      repoRoot, 'src', 'web', 'src', 'components', 'primitives.tsx',
    ),
  };

  const shapes = [...favicon.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(shapes.length >= 2, 'se esperaban los trazos del buzón en favicon.svg');

  for (const [label, copyPath] of Object.entries(copies)) {
    const copy = fs.readFileSync(copyPath, 'utf8');
    for (const shape of shapes) {
      assert.ok(
        copy.includes(shape),
        `${label} ha dejado de compartir geometría con favicon.svg. `
          + 'Actualiza las tres copias para que la marca siga siendo una sola.',
      );
    }
  }
});

test('frontend: public/ no acumula assets huérfanos', () => {
  // icons.svg (Bluesky, Discord, X…) quedó de la versión anterior y no lo
  // referenciaba nadie, pero se copiaba a dist/ y se servía.
  const publicDir = path.join(repoRoot, 'src', 'web', 'public');
  assert.deepEqual(fs.readdirSync(publicDir).sort(), ['favicon.svg']);
});

test('frontend: sin framer-motion (el Toast anima con CSS)', () => {
  const web = readJsonFile(repoRoot, 'src', 'web', 'package.json');
  const declared = { ...web.dependencies, ...web.devDependencies };
  assert.equal(Object.hasOwn(declared, 'framer-motion'), false);
});
