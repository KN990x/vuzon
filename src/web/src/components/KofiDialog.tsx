import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useDialog } from '../lib/use-dialog';
import { useI18n } from '../i18n/context';
import { iconButtonClass } from './primitives';

/** Where the "open it yourself" escape hatch points. */
const KOFI_PAGE_URL = 'https://ko-fi.com/kn990x';

/**
 * Ko-fi's own embed URL, verbatim. Every parameter is theirs and none of them is ours to
 * tune: `widget`/`embed` select the panel layout, `hidefeed` drops the activity stream and
 * `preview` is what renders the donation form rather than a profile page.
 */
const KOFI_EMBED_URL = 'https://ko-fi.com/kn990x/?hidefeed=true&widget=true&embed=true&preview=true';

/**
 * The widget's natural height, from Ko-fi's snippet. Kept as the frame's height attribute
 * (a presentational attribute, not a `style=""`, which `style-src 'self'` would block) and
 * scrolled inside its container when the viewport cannot fit it.
 */
const KOFI_FRAME_HEIGHT = 712;

/** Matches the leaving animation in index.css; the timer is only the net under it. */
const CLOSE_ANIMATION_MS = 350;

/**
 * A cross-origin frame reports `load` for its error pages too, and reports nothing at all
 * when an extension removes it — so a timer is the only way to stop showing a skeleton
 * forever over a rectangle that is never going to fill.
 */
const LOAD_TIMEOUT_MS = 6000;

interface KofiDialogProps {
  onClose: () => void;
}

/**
 * Ko-fi support modal: their widget embedded in the panel instead of a trip to ko-fi.com.
 *
 * This is the one place in the app that frames a third party, and it costs a CSP directive
 * (`frame-src https://ko-fi.com` in create-app.js). The `sandbox` below is the other half
 * of that trade: `allow-top-navigation-by-user-activation` rather than plain
 * `allow-top-navigation` means the widget can send someone to checkout when they click,
 * and cannot navigate the panel away on its own.
 *
 * The modal plumbing — Escape, backdrop, `inert` siblings, body scroll lock, focus
 * restoration — is `useDialog`, shared with ConfirmDialog and AccountDialog. What is local
 * here is the leaving animation, which no other dialog has: they unmount in one frame.
 */
export function KofiDialog({ onClose }: KofiDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Closing is one-way: a second Escape while the exit animation runs must not restart it.
  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const { overlayRef, dialogRef, trapTab, onBackdropMouseDown } = useDialog({
    onClose: requestClose,
    initialFocusRef: closeButtonRef,
  });

  // Read through a ref so the fallback timer below does not restart every time the parent
  // re-renders: `onClose` is an inline arrow in Dashboard, so its identity changes on each
  // pass and a dependency on it would keep clearing the timeout that is supposed to fire.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!closing) {
      return undefined;
    }
    // `animationend` does the unmounting; this only covers the case where it never fires
    // (no animation applied at all), which would otherwise leave the dialog stuck open.
    const timer = window.setTimeout(() => onCloseRef.current(), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (loaded) {
      return undefined;
    }
    const timer = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  /**
   * Only the panel's own animation ends the dialog. Anything animating inside it — the
   * skeleton, a future spinner — bubbles its `animationend` through here too.
   */
  const onPanelAnimationEnd = useCallback(
    (event: ReactAnimationEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && closing) {
        onCloseRef.current();
      }
    },
    [closing],
  );

  /**
   * Focus that walks off the end of the widget comes back here.
   *
   * Once focus is inside a cross-origin frame the parent document sees only the `<iframe>`
   * as its `activeElement` and receives none of the key events, so `trapTab` cannot act on
   * the last Tab of the widget's own order — the browser simply moves on to whatever
   * follows the frame. The sentinel is that "whatever follows".
   */
  const onSentinelFocus = useCallback(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      data-closing={closing}
      className="dialog-overlay fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-ink/70 backdrop-blur-sm"
    >
      {/* Outer scrolls; inner centres. Same-node flex+scroll clips the top on short viewports. */}
      <div
        className="flex min-h-full items-end justify-center px-0 py-0 sm:items-center sm:px-6 sm:py-10"
        onMouseDown={onBackdropMouseDown}
      >
        <div
          ref={dialogRef}
          data-closing={closing}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="dialog-panel glass glass-dialog relative flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-panel rounded-b-none p-6 sm:max-h-none sm:rounded-panel sm:p-7"
          onKeyDown={trapTab}
          onAnimationEnd={onPanelAnimationEnd}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2
                id={titleId}
                className="m-0 mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-cream"
              >
                {t('kofi.title')}
              </h2>
              <p id={descriptionId} className="m-0 text-[12.5px] leading-relaxed text-cream/60">
                {t('kofi.subtitle')}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={requestClose}
              aria-label={t('kofi.close')}
              className={`${iconButtonClass} -mr-2 -mt-1 shrink-0`}
            >
              <X size={18} strokeWidth={1.6} aria-hidden />
            </button>
          </div>

          {/*
            The widget paints its own near-white surface, which no CSS of ours can reach
            through the frame boundary. Framing it as a light card is the alternative to
            looking like a broken theme.
          */}
          <div className="relative overflow-y-auto overscroll-contain rounded-[12px] bg-[#f9f9f9] p-1 max-h-[min(712px,calc(92dvh-9rem))] sm:max-h-[min(712px,calc(100dvh-12rem))]">
            {/* Laid over the frame rather than swapped with it: the frame keeps its full
                height from the first paint, so nothing jumps when the widget arrives. */}
            {!loaded && (
              <p className="absolute inset-0 z-10 m-0 flex items-center justify-center bg-[#f9f9f9] px-6 text-center font-mono text-[11px] leading-relaxed text-ink/50">
                {timedOut ? t('kofi.blocked') : t('kofi.loading')}
              </p>
            )}
            <iframe
              src={KOFI_EMBED_URL}
              title={t('kofi.frameTitle')}
              height={KOFI_FRAME_HEIGHT}
              className="kofi-frame"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              onLoad={() => setLoaded(true)}
            />
          </div>

          <a
            href={KOFI_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 self-center font-mono text-[11px] text-cream/50 underline-offset-4 transition-colors duration-200 hover:text-accent hover:underline"
          >
            {t('kofi.openExternal')}
            <ExternalLink size={12} strokeWidth={1.6} aria-hidden />
          </a>

          <div tabIndex={0} onFocus={onSentinelFocus} className="sr-only" />
        </div>
      </div>
    </div>
  );
}
