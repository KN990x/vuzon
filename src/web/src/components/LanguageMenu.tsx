import { useId } from 'react';
import { Check, Languages } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { LOCALES } from '../i18n/locale';
import type { Locale } from '../i18n/locale';
import { useMenu } from '../lib/use-menu';
import { iconButtonClass } from './primitives';

const LOCALE_LABEL_KEY = {
  en: 'language.en',
  es: 'language.es',
} as const;

/**
 * Language switcher in the header.
 *
 * A menu rather than a two-state toggle: a toggle stops being readable the moment a
 * third language appears, and it never shows which language is currently active.
 * Each item is a `menuitemradio` with `aria-checked`, and carries its own `lang` so a
 * screen reader pronounces "Español" in Spanish while the rest of the page is English.
 */
export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const {
    open, toggle, onTriggerKeyDown, close, containerRef, triggerRef, menuRef,
  } = useMenu({
    // Open onto the language that is actually selected. In a `menuitemradio` group,
    // landing on the first item announces "English, not checked" when Spanish is active.
    initialFocus: () => LOCALES.indexOf(locale),
  });
  const menuId = useId();

  function choose(next: Locale) {
    setLocale(next);
    close();
  }

  const currentLabel = t(LOCALE_LABEL_KEY[locale]);

  return (
    <div ref={containerRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        className={iconButtonClass}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t('header.languageCurrent', { language: currentLabel })}
        aria-label={t('header.languageCurrent', { language: currentLabel })}
      >
        <Languages size={17} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t('header.language')}
          className="glass glass-menu fade-in absolute right-0 top-11 z-50 min-w-36 overflow-hidden rounded-panel py-1"
        >
          {LOCALES.map((option) => {
            const active = option === locale;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={option}
                onClick={() => choose(option)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left text-[13px] transition-colors duration-200 hover:bg-white/[0.06] ${
                  active ? 'text-accent' : 'text-cream/75 hover:text-cream'
                }`}
              >
                <span className="flex size-3.5 flex-none items-center justify-center">
                  {active && <Check size={13} aria-hidden />}
                </span>
                {t(LOCALE_LABEL_KEY[option])}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
