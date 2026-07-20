import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getPlaceholderConfigurationIssue,
  PLACEHOLDER_EXEMPT_KEYS,
} from '../../config/placeholder-guard.js';

const unitDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(unitDir, '..', '..', '..', '..'); // raíz del workspace

/**
 * Pares CLAVE=valor sin comentar de `.env.example`.
 * @returns {Array<[string, string]>}
 */
function readEnvExampleEntries() {
  const raw = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  const entries = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorAt = trimmed.indexOf('=');
    if (separatorAt <= 0) {
      continue;
    }
    entries.push([
      trimmed.slice(0, separatorAt).trim(),
      trimmed.slice(separatorAt + 1).trim(),
    ]);
  }

  return entries;
}

test('placeholder-guard: cada valor de .env.example está cubierto o exento', () => {
  const entries = readEnvExampleEntries();
  assert.ok(entries.length > 0, 'se esperaba al menos una entrada en .env.example');

  for (const [key, value] of entries) {
    if (!value || PLACEHOLDER_EXEMPT_KEYS.has(key)) {
      continue;
    }

    const issue = getPlaceholderConfigurationIssue({ [key]: value });
    assert.ok(
      issue,
      `.env.example define ${key}=${value} y el guard no lo rechaza. `
        + 'Añádelo a PLACEHOLDER_VALUES_BY_KEY (o a PLACEHOLDER_EXEMPT_KEYS con su motivo).',
    );
    assert.match(issue, new RegExp(key));
  }
});

test('placeholder-guard: el SESSION_SECRET de ejemplo supera los 32 caracteres pero se rechaza', () => {
  const example = 'replace-with-openssl-rand-hex-32-chars';
  // Documenta el fallo original: la validación de longitud por sí sola lo dejaba pasar.
  assert.ok(example.length >= 32);
  assert.match(getPlaceholderConfigurationIssue({ SESSION_SECRET: example }), /SESSION_SECRET/);
});

test('placeholder-guard: rechaza SESSION_SECRET sin entropía', () => {
  assert.match(
    getPlaceholderConfigurationIssue({ SESSION_SECRET: 'a'.repeat(64) }),
    /predecible/,
  );
  assert.match(
    getPlaceholderConfigurationIssue({ SESSION_SECRET: 'ab'.repeat(32) }),
    /predecible/,
  );
});

test('placeholder-guard: acepta un secreto real de openssl rand -hex 32', () => {
  const realistic = '9f3c1a7d0e5b48620fa1c37d9e2b8054a6d13f7c2e908b45d61af03c7e5928bd';
  assert.equal(getPlaceholderConfigurationIssue({ SESSION_SECRET: realistic }), null);
});

test('placeholder-guard: AUTH_USER=admin es una elección legítima', () => {
  assert.equal(getPlaceholderConfigurationIssue({ AUTH_USER: 'admin' }), null);
});

test('placeholder-guard: entorno normal no produce aviso', () => {
  assert.equal(
    getPlaceholderConfigurationIssue({
      DOMAIN: 'midominio.dev',
      AUTH_USER: 'kn',
      AUTH_PASS: 'una-contrasena-propia',
      CF_API_TOKEN: 'token-real-de-cloudflare',
      SESSION_SECRET: '9f3c1a7d0e5b48620fa1c37d9e2b8054a6d13f7c2e908b45d61af03c7e5928bd',
    }),
    null,
  );
});
