import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getPlaceholderConfigurationIssue,
  PLACEHOLDER_EXEMPT_KEYS,
  PLACEHOLDER_VALUES_BY_KEY,
} from '../../config/placeholder-guard.js';

const unitDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(unitDir, '..', '..', '..', '..'); // workspace root

/**
 * Uncommented KEY=value pairs from `.env.example`.
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

/**
 * The test above skips empty values, and `.env.example` currently ships every secret-bearing
 * key empty — which means it walks zero keys and can no longer fail. These two tests are what
 * keeps the guard from quietly becoming decoration:
 *
 *   1. the template must keep shipping those keys empty (a filled one is a published secret);
 *   2. every value registered in PLACEHOLDER_VALUES_BY_KEY must still be rejected, so the list
 *      does not rot into dead code once it stops being exercised by `.env.example`.
 */
const SECRET_BEARING_ENV_KEYS = ['SESSION_SECRET', 'AUTH_PASS', 'CF_API_TOKEN'];

test('placeholder-guard: .env.example ships the secret-bearing keys empty', () => {
  const entries = readEnvExampleEntries();

  for (const key of SECRET_BEARING_ENV_KEYS) {
    const entry = entries.find(([name]) => name === key);
    assert.ok(entry, `.env.example no longer defines ${key}`);
    assert.equal(
      entry[1],
      '',
      `.env.example ships a value for ${key}. This file is public: leave it empty, `
        + 'and register the value in PLACEHOLDER_VALUES_BY_KEY if it must exist as an example.',
    );
  }
});

test('placeholder-guard: every registered placeholder is still rejected', () => {
  const registered = Object.entries(PLACEHOLDER_VALUES_BY_KEY);
  assert.ok(registered.length > 0, 'expected at least one registered placeholder');

  for (const [key, placeholders] of registered) {
    assert.ok(placeholders.length > 0, `${key} is registered with no values`);
    for (const value of placeholders) {
      const issue = getPlaceholderConfigurationIssue({ [key]: value });
      assert.ok(issue, `${key}=${value} is registered as a placeholder but not rejected`);
      assert.match(issue, new RegExp(key));
    }
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
      DOMAIN: 'mydomain.dev',
      AUTH_USER: 'kn',
      AUTH_PASS: 'a-password-of-my-own',
      CF_API_TOKEN: 'real-cloudflare-token-value',
      SESSION_SECRET: '9f3c1a7d0e5b48620fa1c37d9e2b8054a6d13f7c2e908b45d61af03c7e5928bd',
    }),
    null,
  );
});
