import { useEffect, useId, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { LOCALES } from '../i18n/locale';
import type { Locale } from '../i18n/locale';
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        // Escape must not leave focus stranded on a node that is being unmounted.
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    setLocale(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const currentLabel = t(LOCALE_LABEL_KEY[locale]);

  return (
    <div ref={containerRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        className={iconButtonClass}
        onClick={() => setOpen((prev) => !prev)}
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
          id={menuId}
          role="menu"
          aria-label={t('header.language')}
          className="glass fade-in absolute right-0 top-11 z-50 min-w-36 overflow-hidden rounded-panel py-1"
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
                  active ? 'text-accent' : 'text-cream/75'
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
