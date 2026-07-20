import { expect, test } from 'vitest';
import { en } from './en';
import { es } from './es';
import { CATALOGUES, LOCALES } from './locale';

/**
 * `es.ts` is typed with `satisfies Messages`, so a MISSING key is already a build error.
 * What the type system cannot catch is a key left blank, or a placeholder that was
 * dropped in translation — `{alias}` disappearing turns an actionable error into a vague
 * one. That is what these tests cover.
 */
test('both catalogues expose exactly the same keys', () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});

test('no catalogue has empty strings', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(CATALOGUES[locale])) {
      expect(value.trim(), `${locale}: ${key} is empty`).not.toBe('');
    }
  }
});

test('every translation keeps the placeholders of the English source', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const [key, source] of Object.entries(en)) {
    const translated = (es as Record<string, string>)[key];
    expect(placeholders(translated), `es: ${key}`).toEqual(placeholders(source));
  }
});
