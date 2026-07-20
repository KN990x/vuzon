import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { isVerifiedStatus } from './verification';

const casesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'src',
  'shared',
  'verified-status-cases.json',
);

test('verified status: client matches the shared case table', () => {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as Array<{
    value: unknown;
    verified: boolean;
    why: string;
  }>;

  expect(cases.length).toBeGreaterThan(0);

  for (const { value, verified, why } of cases) {
    expect(isVerifiedStatus(value), why).toBe(verified);
  }
});
