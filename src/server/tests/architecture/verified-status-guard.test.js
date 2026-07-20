import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isVerifiedAddress } from '../../features/email-routing/rule-diagnostics.js';

const architectureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(architectureDir, '..', '..', '..', '..');
const casesPath = path.join(repoRoot, 'src', 'shared', 'verified-status-cases.json');

/**
 * Keeps the server predicate aligned with the SPA (`verification.ts`). The two packages
 * cannot share a module (JS vs TS), so both consume this table instead.
 */
test('verified status: server matches the shared case table', () => {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  assert.ok(Array.isArray(cases) && cases.length > 0, 'case table must not be empty');

  for (const { value, verified, why } of cases) {
    assert.equal(
      isVerifiedAddress(value),
      verified,
      `isVerifiedAddress(${JSON.stringify(value)}) should be ${verified} (${why})`,
    );
  }
});
