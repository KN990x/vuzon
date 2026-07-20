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
const repoRoot = path.join(unitDir, '..', '..', '..', '..'); // workspace root

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

test('placeholder-guard: every .env.example value is covered or exempt', () => {
  const entries = readEnvExampleEntries();
  assert.ok(entries.length > 0, 'expected at least one entry in .env.example');

  for (const [key, value] of entries) {
    if (!value || PLACEHOLDER_EXEMPT_KEYS.has(key)) {
      continue;
    }

    const issue = getPlaceholderConfigurationIssue({ [key]: value });
    assert.ok(
      issue,
      `.env.example defines ${key}=${value} and the guard does not reject it. `
        + 'Add it to PLACEHOLDER_VALUES_BY_KEY (or to PLACEHOLDER_EXEMPT_KEYS with a reason).',
    );
    assert.match(issue, new RegExp(key));
  }
});

test('placeholder-guard: the example SESSION_SECRET is over 32 characters yet is rejected', () => {
  const example = 'replace-with-openssl-rand-hex-32-chars';
  // Documents the original bug: the length check alone let this through.
  assert.ok(example.length >= 32);
  assert.match(getPlaceholderConfigurationIssue({ SESSION_SECRET: example }), /SESSION_SECRET/);
});

test('placeholder-guard: rejects a SESSION_SECRET without entropy', () => {
  assert.match(
    getPlaceholderConfigurationIssue({ SESSION_SECRET: 'a'.repeat(64) }),
    /too predictable/,
  );
  assert.match(
    getPlaceholderConfigurationIssue({ SESSION_SECRET: 'ab'.repeat(32) }),
    /too predictable/,
  );
});

test('placeholder-guard: accepts a real secret from openssl rand -hex 32', () => {
  const realistic = '9f3c1a7d0e5b48620fa1c37d9e2b8054a6d13f7c2e908b45d61af03c7e5928bd';
  assert.equal(getPlaceholderConfigurationIssue({ SESSION_SECRET: realistic }), null);
});

test('placeholder-guard: AUTH_USER=admin is a legitimate choice', () => {
  assert.equal(getPlaceholderConfigurationIssue({ AUTH_USER: 'admin' }), null);
});

test('placeholder-guard: a normal environment produces no warning', () => {
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
