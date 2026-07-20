import { afterEach, expect, test, vi } from 'vitest';
import {
  createTranslator,
  DEFAULT_LOCALE,
  interpolate,
  isLocale,
  persistLocale,
  pluralKey,
  readStoredLocale,
  resolveInitialLocale,
  STORAGE_KEY,
} from './locale';

function stubStorage(store: Record<string, string>, { throws = false } = {}) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => {
        if (throws) throw new Error('storage disabled');
        return store[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        if (throws) throw new Error('storage disabled');
        store[key] = value;
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the default is English, as the README leads with', () => {
  expect(DEFAULT_LOCALE).toBe('en');
  stubStorage({});
  expect(resolveInitialLocale()).toBe('en');
});

test('isLocale only accepts the shipped locales', () => {
  expect(isLocale('en')).toBe(true);
  expect(isLocale('es')).toBe(true);
  expect(isLocale('fr')).toBe(false);
  expect(isLocale(null)).toBe(false);
});

test('the stored choice wins over the default', () => {
  stubStorage({ [STORAGE_KEY]: 'es' });
  expect(readStoredLocale()).toBe('es');
  expect(resolveInitialLocale()).toBe('es');
});

test('a corrupted stored value is ignored', () => {
  stubStorage({ [STORAGE_KEY]: 'klingon' });
  expect(readStoredLocale()).toBeNull();
  expect(resolveInitialLocale()).toBe('en');
});

test('persistLocale round-trips through storage', () => {
  const store: Record<string, string> = {};
  stubStorage(store);
  persistLocale('es');
  expect(store[STORAGE_KEY]).toBe('es');
  expect(readStoredLocale()).toBe('es');
});

// Safari private browsing and locked-down proxies throw on localStorage: the panel must
// keep working, just without remembering the choice.
test('storage that throws does not break the panel', () => {
  stubStorage({}, { throws: true });
  expect(() => persistLocale('es')).not.toThrow();
  expect(readStoredLocale()).toBeNull();
  expect(resolveInitialLocale()).toBe('en');
});

test('interpolate fills {placeholders} and leaves unknown ones alone', () => {
  expect(interpolate('Hi {name}, you have {n}', { name: 'KN', n: 3 })).toBe('Hi KN, you have 3');
  expect(interpolate('Hi {name}')).toBe('Hi {name}');
  expect(interpolate('Hi {name}', { other: 'x' })).toBe('Hi {name}');
});

test('pluralKey picks the category for the locale', () => {
  expect(pluralKey('aliases.count', 1, 'en')).toBe('aliases.count.one');
  expect(pluralKey('aliases.count', 0, 'en')).toBe('aliases.count.other');
  expect(pluralKey('aliases.count', 2, 'es')).toBe('aliases.count.other');
});

test('the translator resolves keys, params and plurals per language', () => {
  const en = createTranslator('en');
  const es = createTranslator('es');

  expect(en.t('aliases.title')).toBe('Aliases');
  expect(es.t('aliases.title')).toBe('Alias');

  expect(en.tn('aliases.count', 1)).toBe('1 rule');
  expect(en.tn('aliases.count', 7)).toBe('7 rules');
  expect(es.tn('aliases.count', 1)).toBe('1 regla');
  expect(es.tn('aliases.count', 7)).toBe('7 reglas');

  expect(es.t('aliases.row.destLabel', { alias: 'a@x.com' })).toBe('Destino de a@x.com');
});

test('tRaw reports the miss instead of rendering a blank', () => {
  const { tRaw } = createTranslator('en');
  expect(tRaw('aliases.title')).toBe('Aliases');
  expect(tRaw('does.not.exist')).toBeUndefined();
});
