import { createContext, use } from 'react';
import { createTranslator, DEFAULT_LOCALE } from './locale';
import type { Locale, Translator } from './locale';

export interface I18nValue extends Translator {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * The default value is a working English translator rather than `null`: a component
 * rendered outside the provider (a test, a future portal) still shows real copy instead
 * of throwing.
 */
export const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  ...createTranslator(DEFAULT_LOCALE),
});

export function useI18n(): I18nValue {
  return use(I18nContext);
}
