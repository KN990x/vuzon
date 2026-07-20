import { Coffee } from 'lucide-react';
import { useI18n } from '../i18n/context';

/**
 * Discreet footer: authorship and a support link.
 *
 * The Buy Me a Coffee button does NOT use the official CDN image on purpose: the server's
 * CSP is `img-src 'self' data:` (see create-app.js), so an external <img> would be blocked
 * and the footer would render broken. It is reproduced with an inline icon and the panel's
 * tokens, which also fits the rest of the interface.
 *
 * The year is computed on every render so nobody has to touch it each January.
 */
export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 pb-10 font-mono text-[11px] text-cream/45">
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
      <a
        href="https://buymeacoffee.com/kn990x"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-full bg-accent/[0.07] px-3 py-1.5 text-accent/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] transition-colors duration-200 hover:bg-accent/[0.12] hover:text-accent"
      >
        <Coffee size={12} aria-hidden />
        {t('footer.coffee')}
      </a>
    </footer>
  );
}
