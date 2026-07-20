import { Activity, ArrowRight } from 'lucide-react';
import type { Rule } from '../lib/types';
import { getRuleDest } from '../lib/rules';
import { useI18n } from '../i18n/context';
import { CardIcon, chipClass } from './primitives';

/**
 * Catch-all card. READ-ONLY by contract: the backend rejects enable/disable/delete on
 * this rule, so there are no controls here.
 */
export function CatchAllCard({ catchAll }: { catchAll: Rule | null }) {
  const i18n = useI18n();
  const { t } = i18n;
  const enabled = Boolean(catchAll?.enabled);
  const destText = getRuleDest(i18n, catchAll);

  let stateLabel = t('catchAll.state.unavailable');
  if (catchAll !== null) {
    stateLabel = enabled ? t('catchAll.state.active') : t('catchAll.state.paused');
  }

  return (
    <section className="glass relative rounded-panel p-5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CardIcon>
            <Activity size={14} />
          </CardIcon>
          <span className="text-[15px] font-bold tracking-[-0.01em]">{t('catchAll.title')}</span>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
            catchAll !== null && enabled ? 'text-positive' : 'text-cream/60'
          }`}
        >
          {stateLabel}
        </span>
      </div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-cream/60">
        {t('catchAll.description')}
      </p>
      <div className={`${chipClass} ${enabled ? 'text-cream/75' : 'text-cream/65'}`}>
        <ArrowRight size={13} className="flex-none" aria-hidden />
        <span className="min-w-0 truncate">
          {catchAll === null ? t('catchAll.loadError') : destText || t('catchAll.noAction')}
        </span>
      </div>
    </section>
  );
}
