import { Coffee } from 'lucide-react';

/**
 * Pie discreto: autoría y enlace de apoyo.
 *
 * El botón de Buy Me a Coffee NO usa la imagen oficial de su CDN a propósito: la CSP
 * del servidor es `img-src 'self' data:` (ver create-app.js), así que un <img> externo
 * quedaría bloqueado y el pie saldría roto. Se replica con un icono inline y los
 * tokens del panel, que además encaja con el resto de la interfaz.
 *
 * El año se calcula en cada render para que no haya que tocarlo cada enero.
 */
export function Footer() {
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
        Invítame a un café
      </a>
    </footer>
  );
}
