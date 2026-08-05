import { Check, Clock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { Destination } from '../lib/types';
import { isVerifiedStatus } from '../lib/verification';
import { useI18n } from '../i18n/context';
import {
  CardIcon,
  cardTitleClass,
  formErrorClass,
  pillButtonClass,
  rowDeleteButtonClass,
  rowDividerClass,
  rowPaddingClass,
  textFieldClass,
} from './primitives';

interface DestinationsCardProps {
  dests: Destination[];
  /** False until the first refresh comes back, so the empty state does not flash first. */
  loaded: boolean;
  newDestInput: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  isDestPending: (id: string) => boolean;
  error: string;
}

export function DestinationsCard({
  dests, loaded, newDestInput, onInputChange, onAdd, onDelete, loading, isDestPending, error,
}: DestinationsCardProps) {
  const { t } = useI18n();

  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <CardIcon>
          <ShieldCheck size={14} />
        </CardIcon>
        <span className={cardTitleClass}>{t('dests.title')}</span>
      </div>

      {dests.map((dest) => {
        const verified = isVerifiedStatus(dest.verified);
        const pending = isDestPending(dest.id);
        return (
          <div key={dest.id} className={`flex items-center gap-2.5 ${rowPaddingClass} ${rowDividerClass}`}>
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-cream/75">
              {dest.email}
            </span>
            {verified ? (
              <span className="flex flex-none items-center gap-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-positive">
                <Check size={12} aria-hidden />
                {t('dests.verified')}
              </span>
            ) : (
              <span className="flex flex-none items-center gap-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-cream/60">
                <Clock size={12} aria-hidden />
                {t('dests.pending')}
              </span>
            )}
            <button
              type="button"
              onClick={() => onDelete(dest.id)}
              disabled={pending}
              title={t('dests.delete')}
              aria-label={t('dests.deleteNamed', { email: dest.email })}
              className={rowDeleteButtonClass}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}

      {dests.length === 0 && (
        <div className={`${rowPaddingClass} font-mono text-xs text-cream/60 ${rowDividerClass}`}>
          {loaded ? t('dests.empty') : t('dests.loading')}
        </div>
      )}

      <form
        className={rowPaddingClass}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex text-cream/65" aria-hidden>
            <Plus size={15} />
          </span>
          <input
            type="email"
            value={newDestInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={t('dests.new.placeholder')}
            aria-label={t('dests.new.label')}
            className={`${textFieldClass} min-w-0 flex-1 text-[13px]`}
          />
          <button type="submit" className={pillButtonClass} disabled={!newDestInput || loading}>
            {t('dests.new.submit')}
          </button>
        </div>
        {error && <p className={`${formErrorClass} mt-2`}>{error}</p>}
      </form>
    </section>
  );
}
