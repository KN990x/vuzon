import { en } from './en';
import { es } from './es';
import type { MessageKey, Messages } from './en';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * English is the default on purpose: it is the language the README leads with, and a
 * fixed default keeps the first paint deterministic (no browser sniffing to reason
 * about). The user's explicit choice wins from then on.
 */
export const DEFAULT_LOCALE: Locale = 'en';

export const STORAGE_KEY = 'vuzon:lang';

export const CATALOGUES: Record<Locale, Messages> = { en, es };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The panel must keep working where `localStorage` throws (Safari private browsing,
 * storage disabled behind a strict proxy): the language simply stops persisting.
 */
export function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the choice lasts for this page load only.
  }
}

export function resolveInitialLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

export type MessageParams = Record<string, string | number>;

/** Replaces `{name}` placeholders. An unknown placeholder is left untouched. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * `base` + the plural category of `count` (`aliases.count` → `aliases.count.other`).
 * `Intl.PluralRules` covers both languages here and any that gets added later.
 */
export function pluralKey(base: string, count: number, locale: Locale): string {
  const category = new Intl.PluralRules(locale).select(count);
  return `${base}.${category}`;
}

/** Keys that come in `.one` / `.other` pairs, derived from the catalogue itself. */
export type PluralBaseKey = {
  [K in MessageKey]: K extends `${infer Base}.one` ? Base : never;
}[MessageKey];

export interface Translator {
  /** Translates a known key. Missing keys are impossible: `MessageKey` is checked. */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Plural form of `base` for `count` (also exposed to the template as `{count}`). */
  tn: (base: PluralBaseKey, count: number, params?: MessageParams) => string;
  /**
   * Lookup by a runtime string, for keys built from a server error code. Returns
   * `undefined` when the catalogue does not have it, so the caller can fall back to the
   * English text the server sent instead of rendering a blank.
   */
  tRaw: (key: string, params?: MessageParams) => string | undefined;
}

export function createTranslator(locale: Locale): Translator {
  const catalogue = CATALOGUES[locale] as Record<string, string>;

  const tRaw: Translator['tRaw'] = (key, params) => {
    const template = catalogue[key];
    return template === undefined ? undefined : interpolate(template, params);
  };

  return {
    t: (key, params) => tRaw(key, params) ?? key,
    tn: (base, count, params) => {
      const key = pluralKey(base, count, locale);
      // A locale with categories beyond one/other (`few`, `many`) falls back to
      // `.other`, which is the form both catalogues always define.
      return tRaw(key, { count, ...params })
        ?? tRaw(`${base}.other`, { count, ...params })
        ?? base;
    },
    tRaw,
  };
}
