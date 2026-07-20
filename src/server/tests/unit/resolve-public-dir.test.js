import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { resolvePublicDir } from '../../bootstrap/resolve-public-dir.js';

test('resolvePublicDir: VUZON_PUBLIC_DIR tiene prioridad', () => {
  const dir = resolvePublicDir({ VUZON_PUBLIC_DIR: '/var/custom/public' });
  assert.equal(dir, path.resolve('/var/custom/public'));
});

test('resolvePublicDir: por defecto apunta a src/web/dist del paquete', () => {
  const dir = resolvePublicDir({});
  assert.ok(dir.endsWith(`${path.sep}web${path.sep}dist`), dir);
});
