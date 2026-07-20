import type { ReactNode } from 'react';

/** Botón píldora del diseño (relleno ámbar suave + brillo interior + hover scale). */
export const pillButtonClass =
  'relative cursor-pointer rounded-full bg-accent/[0.08] px-4 py-[7px] text-[12.5px] ' +
  'font-medium text-accent shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] ' +
  'transition-transform duration-200 hover:scale-105 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100';

/** Botón de icono de la cabecera (36×36, hover scale). */
export const iconButtonClass =
  'flex size-9 cursor-pointer items-center justify-center text-cream/80 ' +
  'transition-[transform,color] duration-200 hover:scale-105 hover:text-cream ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/** Chip monoespaciado sobre fondo blanco translúcido (destino del catch-all). */
export const chipClass =
  'flex items-center gap-2 rounded-[10px] bg-white/[0.04] px-3 py-[9px] font-mono text-xs';

/** Círculo ámbar de 30px que acompaña a los títulos de tarjeta. */
export function CardIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-[30px] flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
      {children}
    </span>
  );
}

/**
 * Marca de vuzon: buzón sobre disco ámbar.
 *
 * Va inline (como GitHubIcon) en vez de como <img>: evita una petición extra,
 * escala sin pixelarse y mantiene `src/web/public/` con un único asset. La
 * geometría es la MISMA que la de `public/favicon.svg`, así que la marca de la
 * pestaña y la de la interfaz no pueden divergir. Si se retoca una, retoca la otra.
 */
export function VuzonMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="flex-none text-accent"
      role="img"
      aria-label="vuzon"
    >
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <g fill="var(--color-ink)">
        <path d="M20.9 6.4c0-.55.45-1 1-1h3.3c.55 0 1 .45 1 1v2.4c0 .55-.45 1-1 1h-2.3v3.1a1 1 0 0 1-2 0z" />
        <path d="M6.9 22.1v-5.3a5.9 5.9 0 0 1 5.9-5.9h6.4a5.9 5.9 0 0 1 5.9 5.9v5.3z" />
        <rect x="14.6" y="21.2" width="2.8" height="6.6" rx="1.1" />
      </g>
      <rect x="10.2" y="15.5" width="8.4" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

/** SVG de GitHub tal cual aparece en la cabecera del diseño. */
export function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
