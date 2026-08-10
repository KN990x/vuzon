import { useState } from 'react';
import { Coffee } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { KofiDialog } from './KofiDialog';

/**
 * Discreet footer: authorship and a support control that opens the Ko-fi Tip Panel.
 *
 * The button is custom (Lucide + panel tokens), not Ko-fi's CDN badge: CSP is
 * `img-src 'self' data:` so an external <img> would render broken. The Tip Panel itself
 * lives in a modal iframe rather than the floating overlay script — that script would
 * require opening `script-src` to a third-party CDN; see KofiDialog.tsx and create-app.js.
 *
 * The year is computed on every render so nobody has to touch it each January.
 */
export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const [kofiOpen, setKofiOpen] = useState(false);

  return (
    <>
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
          onClick={() => setKofiOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-accent/[0.07] px-3 py-1.5 text-accent/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] transition-colors duration-200 hover:bg-accent/[0.12] hover:text-accent"
        >
          <Coffee size={12} aria-hidden />
          {t('footer.coffee')}
        </button>
      </footer>
      {kofiOpen && <KofiDialog onClose={() => setKofiOpen(false)} />}
    </>
  );
}
