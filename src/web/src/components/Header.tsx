import { LogOut, RefreshCw } from 'lucide-react';
import { GitHubIcon, iconButtonClass, VuzonMark } from './primitives';

interface HeaderProps {
  domain: string;
  loading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function Header({ domain, loading, onRefresh, onLogout }: HeaderProps) {
  return (
    <header className="glass glass-header fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-4 px-6">
      {/* Lockup: marca y wordmark juntos (gap corto), el chip ya respira con el gap del header. */}
      <span className="flex items-center gap-2.5">
        <VuzonMark size={26} />
        <span className="text-xl font-bold tracking-[-0.045em] text-cream">vuzon</span>
      </span>
      <span className="rounded-md bg-accent/10 px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Panel
      </span>
      <div className="ml-auto flex items-center gap-2 font-mono text-xs text-cream/65">
        <span className="size-[7px] rounded-full bg-positive" aria-hidden />
        {domain || '…'}
      </div>
      <button
        type="button"
        className={iconButtonClass}
        onClick={onRefresh}
        disabled={loading}
        title="Actualizar"
        aria-label="Actualizar"
      >
        <RefreshCw size={17} className={loading ? 'animate-spin' : undefined} />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={onLogout}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut size={17} />
      </button>
      <a
        href="https://github.com/KN990x/vuzon"
        target="_blank"
        rel="noreferrer"
        className={iconButtonClass}
        title="GitHub"
        aria-label="GitHub"
      >
        <GitHubIcon />
      </a>
    </header>
  );
}
