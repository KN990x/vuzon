import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../lib/use-dialog';
import { useI18n } from '../i18n/context';

const KOFI_PAGE_URL = 'https://ko-fi.com/kn990x';
const KOFI_EMBED_URL =
  'https://ko-fi.com/kn990x/?hidefeed=true&widget=true&embed=true';

interface KofiDialogProps {
  onClose: () => void;
}

/**
 * Ko-fi Tip Panel in a modal.
 *
 * The official floating overlay loads a third-party script (storage.ko-fi.com), which
 * would force opening `script-src` beyond `'self'`. The Tip Panel is an iframe only —
 * CSP allows that origin via `frame-src https://ko-fi.com` and nothing else. The embed
 * is mounted only while the dialog is open so a dashboard visit never talks to Ko-fi
 * until the user asks.
 *
 * No literal `style=` attributes: production CSP is `style-src 'self'` (see AGENTS.md).
 * Equivalents live in Tailwind classes and `.kofi-embed` in index.css.
 */
export function KofiDialog({ onClose }: KofiDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { overlayRef, dialogRef, trapTab, onBackdropMouseDown } = useDialog({
    onClose,
    initialFocusRef: closeButtonRef,
  });

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-ink/70"
    >
      {/* Outer scrolls; inner centres. Same-node flex+scroll clips the top on short viewports. */}
      <div
        className="flex min-h-full items-center justify-center px-6 py-10"
        onMouseDown={onBackdropMouseDown}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fade-in glass glass-dialog relative w-full max-w-md overflow-hidden rounded-panel"
          onKeyDown={trapTab}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2
              id={titleId}
              className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-cream"
            >
              {t('footer.kofi.title')}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={t('footer.kofi.close')}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-cream/65 transition-colors duration-200 hover:bg-cream/[0.06] hover:text-cream"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <iframe
            id="kofiframe"
            className="kofi-embed block w-full border-0 bg-[#f9f9f9] px-1"
            src={KOFI_EMBED_URL}
            title={t('footer.kofi.iframeTitle')}
            height={712}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />

          <p className="m-0 px-5 py-3 text-center font-mono text-[11px]">
            <a
              href={KOFI_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-cream/55 underline-offset-4 transition-colors duration-200 hover:text-accent hover:underline"
            >
              {t('footer.kofi.openPage')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
