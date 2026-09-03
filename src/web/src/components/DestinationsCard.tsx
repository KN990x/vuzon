import { useId } from 'react';
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
  /** True when `/api/addresses` failed: do not claim the list is empty. */
  loadFailed: boolean;
  newDestInput: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  isDestPending: (id: string) => boolean;
  error: string;
}

export function DestinationsCard({
  dests, loaded, loadFailed, newDestInput, onInputChange, onAdd, onDelete, loading, isDestPending, error,
}: DestinationsCardProps) {
  const { t } = useI18n();
  const titleId = useId();
  const errorId = useId();

  return (
    // Named landmark + real heading: see the comment in AliasesCard.
    <section aria-labelledby={titleId} className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <CardIcon>
          <ShieldCheck size={14} />
        </CardIcon>
        <h2 id={titleId} className={`m-0 ${cardTitleClass}`}>{t('dests.title')}</h2>
      </div>

      {/* Same reasoning as AliasesCard: a real list so item counts and position are announced. */}
      <ul role="list" className="m-0 list-none p-0">
        {dests.map((dest) => {
        const verified = isVerifiedStatus(dest.verified);
        const pending = isDestPending(dest.id);
        return (
          <li key={dest.id} className={`flex items-center gap-2.5 ${rowPaddingClass} ${rowDividerClass}`}>
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
          </li>
        );
        })}
      </ul>

      {dests.length === 0 && !loadFailed && (
        <div className={`${rowPaddingClass} font-mono text-xs text-cream/60 ${rowDividerClass}`}>
          {loaded ? t('dests.empty') : t('dests.loading')}
        </div>
      )}

      <form
        className={rowPaddingClass}
        // `noValidate` with type="text" below: a type="email" input inside a form pops the
        // browser's own validation bubble, rendered in the BROWSER's language rather than
        // the panel's — the same objection that rules out window.confirm here. The server
        // answers `email.invalid`, which both catalogues translate.
        noValidate
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
            type="text"
            inputMode="email"
            autoComplete="email"
            value={newDestInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={t('dests.new.placeholder')}
            aria-label={t('dests.new.label')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`${textFieldClass} min-w-0 flex-1 text-[13px]`}
          />
          <button type="submit" className={pillButtonClass} disabled={!newDestInput || loading}>
            {t('dests.new.submit')}
          </button>
        </div>
        {/* role="alert": these errors go to card state, not the toast, so without a live
            region a screen-reader user got no feedback at all on a rejected submit. */}
        {error && <p id={errorId} role="alert" className={`${formErrorClass} mt-2`}>{error}</p>}
      </form>
    </section>
  );
}
