import { LogOut, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { GitHubIcon, iconButtonClass, VuzonMark } from './primitives';
import { LanguageMenu } from './LanguageMenu';

interface HeaderProps {
  domain: string;
  loading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function Header({ domain, loading, onRefresh, onLogout }: HeaderProps) {
  const { t } = useI18n();

  return (
    <header className="glass glass-header fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-4 px-6">
      <span className="flex items-center gap-2.5">
        <VuzonMark size={26} />
        <span className="text-xl font-bold tracking-[-0.045em] text-cream">vuzon</span>
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
        title={t('header.refresh')}
        aria-label={t('header.refresh')}
      >
        <RefreshCw size={17} className={loading ? 'animate-spin' : undefined} />
      </button>
      <LanguageMenu />
      <button
        type="button"
        className={iconButtonClass}
        onClick={onLogout}
        title={t('header.logout')}
        aria-label={t('header.logout')}
      >
        <LogOut size={17} />
      </button>
      <a
        href="https://github.com/KN990x/vuzon"
        target="_blank"
        rel="noreferrer"
        className={iconButtonClass}
        title={t('header.github')}
        aria-label={t('header.github')}
      >
        <GitHubIcon />
      </a>
    </header>
  );
}
