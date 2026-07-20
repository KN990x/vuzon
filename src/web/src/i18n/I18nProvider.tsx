import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { I18nContext } from './context';
import { createTranslator, persistLocale, resolveInitialLocale } from './locale';
import type { Locale } from './locale';

/**
 * Language state for the whole SPA.
 *
 * It also keeps `<html lang>` in sync: screen readers pick the voice from it, and it is
 * what makes the browser offer (or not offer) to translate the page. `index.html` ships
 * `lang="en"` so the very first paint already matches the default.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, ...createTranslator(locale) }),
    [locale, setLocale],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
