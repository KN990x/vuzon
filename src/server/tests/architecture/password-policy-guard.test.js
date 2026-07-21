import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MIN_PASSWORD_LENGTH } from '../../features/auth/setup-body.js';

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(architectureDir, '..', '..', '..', '..');
const webSrcDir = path.join(repoRoot, 'src', 'web', 'src');

/**
 * The minimum password length exists in three places that TypeScript cannot reconcile
 * across the package boundary: the server schema (the authority), the panel's own
 * pre-flight check, and the sentence both catalogues show when it is not met — written
 * out because a validation issue is rendered without params (see i18n/api-errors.ts).
 *
 * Drift here is silent and user-visible: the panel would reject what the server accepts,
 * or promise a number the server does not enforce.
 */
test('password policy: the panel mirrors MIN_PASSWORD_LENGTH', () => {
  const policy = fs.readFileSync(path.join(webSrcDir, 'lib', 'password-policy.ts'), 'utf8');
  assert.match(
    policy,
    new RegExp(`MIN_PASSWORD_LENGTH\\s*=\\s*${MIN_PASSWORD_LENGTH}\\b`),
    `src/web/src/lib/password-policy.ts must declare MIN_PASSWORD_LENGTH = ${MIN_PASSWORD_LENGTH}.`,
  );
});

test('password policy: both catalogues quote the same number', () => {
  for (const file of ['en.ts', 'es.ts']) {
    const catalogue = fs.readFileSync(path.join(webSrcDir, 'i18n', file), 'utf8');
    const line = catalogue
      .split('\n')
      .find((candidate) => candidate.includes("'error.issue.password.too_short'"));
    assert.ok(line, `src/web/src/i18n/${file} is missing 'error.issue.password.too_short'.`);
    assert.ok(
      line.includes(String(MIN_PASSWORD_LENGTH)),
      `src/web/src/i18n/${file} states a different minimum than MIN_PASSWORD_LENGTH `
        + `(${MIN_PASSWORD_LENGTH}).`,
    );
  }
});
