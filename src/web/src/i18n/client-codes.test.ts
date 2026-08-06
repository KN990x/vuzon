import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';

/**
 * Mirror of the server's `tests/architecture/error-codes-guard.test.js`, for the codes the
 * CLIENT invents.
 *
 * The server side is covered: adding to `ERROR_CODES` without adding `error.<code>` to both
 * catalogues fails CI. But `api.ts` mints codes of its own for failures that never reach
 * the server — a timeout, a non-JSON body, a body that is not valid JSON — and nothing
 * enforced the same rule for those. They all happen to be present today; a new one would
 * have degraded silently to the raw English fallback in the Spanish UI, which is exactly
 * the failure mode the server-side guard exists to prevent.
 *
 * It reads the source rather than importing, because these codes are string literals at
 * their throw sites, not a table anything can enumerate at runtime.
 */
const apiSource = readFileSync(
  fileURLToPath(new URL('../lib/api.ts', import.meta.url)),
  'utf8',
);

/** Every `code: '<something>.<something>'` literal, plus the UnauthorizedError default. */
function collectClientCodes(source: string): string[] {
  const found = new Set<string>();
  // Group 1 always participates when the pattern matches, but the type does not know that.
  for (const match of source.matchAll(/\bcode\s*=?\??\s*:?\s*'([a-z_]+\.[a-z_]+)'/g)) {
    if (match[1]) found.add(match[1]);
  }
  for (const match of source.matchAll(/\?\?\s*'([a-z_]+\.[a-z_]+)'/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

describe('client-minted error codes', () => {
  const codes = collectClientCodes(apiSource);

  it('finds the codes api.ts actually mints', () => {
    // A sanity check on the scraper itself: if the regex silently stopped matching, every
    // assertion below would pass over an empty list and the guard would be dead code.
    expect(codes).toEqual(
      expect.arrayContaining([
        'auth.unauthorized',
        'client.invalid_json',
        'client.non_json',
        'client.timeout',
      ]),
    );
  });

  it.each(['en', 'es'] as const)('every client code has an entry in %s', (locale) => {
    const catalogue: Record<string, string> = locale === 'en' ? en : es;
    const missing = codes.filter((code) => !(`error.${code}` in catalogue));
    expect(missing, `missing error.<code> entries in ${locale}.ts`).toEqual([]);
  });
});
