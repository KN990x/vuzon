import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '../../platform/http/error-codes.js';

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(architectureDir, '..', '..', '..', '..');
const catalogueDir = path.join(repoRoot, 'src', 'web', 'src', 'i18n');

/**
 * The panel is bilingual and the wording lives in the browser: the API only sends a
 * `code`. TypeScript keeps `en.ts` and `es.ts` in step with each other, but it cannot
 * see across the package boundary — nothing stops a new server code from shipping with
 * no translation, which the user would meet as the raw English fallback.
 *
 * This test is that missing link.
 */
test('i18n: every server error code has an entry in the panel catalogue', () => {
  const catalogue = fs.readFileSync(path.join(catalogueDir, 'en.ts'), 'utf8');

  for (const code of Object.values(ERROR_CODES)) {
    assert.ok(
      catalogue.includes(`'error.${code}'`),
      `src/web/src/i18n/en.ts is missing 'error.${code}'. `
        + 'Add it to en.ts and es.ts so the panel does not fall back to English.',
    );
  }
});

test('i18n: the zod issue slugs are translated too', () => {
  const catalogue = fs.readFileSync(path.join(catalogueDir, 'en.ts'), 'utf8');
  const formatter = fs.readFileSync(
    path.join(architectureDir, '..', '..', 'platform', 'http', 'format-zod-error.js'),
    'utf8',
  );

  // The slugs are the keys of ISSUE_MESSAGES: 'alias.charset': '…'
  const block = formatter.split('const ISSUE_MESSAGES = {')[1]?.split('\n};')[0] ?? '';
  const slugs = [...block.matchAll(/^\s*'([\w.]+)':/gm)].map((match) => match[1]);
  assert.ok(slugs.length > 0, 'could not read ISSUE_MESSAGES from format-zod-error.js');

  for (const slug of slugs) {
    assert.ok(
      catalogue.includes(`'error.issue.${slug}'`),
      `src/web/src/i18n/en.ts is missing 'error.issue.${slug}'.`,
    );
  }
});
