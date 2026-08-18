import { useI18n } from '../i18n/context';

/**
 * Ko-fi cup (heart steam + mug). Inlined because CSP is `img-src 'self' data:` —
 * the official CDN badge from storage.ko-fi.com would render broken.
 */
function KofiCupIcon() {
  return (
    <svg
      viewBox="0 0 24 16"
      width={20}
      height={13}
      fill="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M8.15 3.35c0-.95.74-1.7 1.68-1.7.54 0 1.03.25 1.35.66.32-.41.81-.66 1.35-.66.94 0 1.68.75 1.68 1.7 0 1.85-3.03 3.35-3.03 3.35S8.15 5.2 8.15 3.35Z"
      />
      <path
        fill="currentColor"
        d="M3.2 8.15h12.4c.44 0 .8.36.8.8v2.55c0 2.26-1.83 4.1-4.1 4.1H7.3c-2.27 0-4.1-1.84-4.1-4.1V8.95c0-.44.36-.8.8-.8Z"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
        d="M16.4 9.15h1.35a2.45 2.45 0 0 1 0 4.9H16.5"
      />
    </svg>
  );
}

interface FooterProps {
  /**
   * Opens the Ko-fi dialog. The state lives in Dashboard rather than here because
   * `useDialog` marks the overlay's SIBLINGS inert — the overlay has to sit next to
   * <header>/<main>/<footer>, not inside one of them.
   */
  onOpenSupport: () => void;
}

/**
 * Discreet footer: authorship and a Ko-fi support control.
 *
 * The control used to be a local recreation of Ko-fi's Widget_2 badge (cup + CTA +
 * #29abe0) linking out to their page. It now opens the widget in a modal (KofiDialog),
 * and its styling comes from the panel's tokens instead of Ko-fi's brand — the badge was
 * the loudest element in a footer that is otherwise deliberately quiet.
 *
 * The cup stays an inline SVG: `img-src 'self' data:` still rules out their CDN badge,
 * and only `frame-src` was opened for the embed.
 *
 * The year is computed on every render so nobody has to touch it each January.
 */
export function Footer({ onOpenSupport }: FooterProps) {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 pb-10 font-mono text-[11px] text-cream/60">
      <p className="m-0">
        © {year}{' '}
        <a
          href="https://kn990x.dev"
          target="_blank"
          rel="noreferrer"
          className="text-cream/60 underline-offset-4 transition-colors duration-200 hover:text-accent hover:underline"
        >
          KN990x
        </a>
      </p>
      <button
        type="button"
        onClick={onOpenSupport}
        aria-haspopup="dialog"
        aria-label={t('footer.kofi.aria')}
        className="kofi-trigger"
      >
        <KofiCupIcon />
        {t('footer.kofi')}
      </button>
    </footer>
  );
}
