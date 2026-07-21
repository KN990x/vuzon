import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Destination, RuleEditorPatch } from '../lib/types';
import type { RuleActionSummary } from '../lib/rules';
import { getDestSelectionState } from '../lib/dest-selection';
import { useI18n } from '../i18n/context';
import { pillButtonClass, selectFieldClass, textFieldClass } from './primitives';

/**
 * Inline editor for what a rule does with the mail. Shared by an alias row
 * (AliasesCard) and the catch-all card, because the choice is the same in both places.
 *
 * The panel writes only `forward` and `drop`. A rule that runs an Email Worker, or that
 * fans out to several addresses, opens with **Keep current** preselected and its action
 * untouched: the patch simply omits `action`, so vuzon hands Cloudflare back exactly what
 * it read. Replacing it is possible, never accidental — the screen confirms first.
 */

interface RuleEditorProps {
  summary: RuleActionSummary;
  verifiedDests: Destination[];
  busy: boolean;
  /** The catch-all has no alias to label, so it hides the name field. */
  name?: string;
  onSave: (patch: RuleEditorPatch) => void;
  onCancel: () => void;
}

type ActionChoice = 'keep' | 'forward' | 'drop';

const radioLabelClass = 'flex cursor-pointer items-center gap-2 text-[12.5px] text-cream/75';

export function RuleEditor({ summary, verifiedDests, busy, name, onSave, onCancel }: RuleEditorProps) {
  const { t } = useI18n();

  // A Worker or fan-out action has no equivalent among the choices the panel can write,
  // so those rules start on "keep" and nothing is replaced unless the user says so.
  const preserved = summary.kind === 'worker' || summary.kind === 'fanout';
  const [choice, setChoice] = useState<ActionChoice>(() => {
    if (preserved) return 'keep';
    return summary.kind === 'drop' ? 'drop' : 'forward';
  });
  // The configured address wins even if it lost its verification: the editor shows what
  // Cloudflare holds. With nothing configured, fall back to the first verified one.
  const [dest, setDest] = useState(() => (
    summary.kind === 'forward'
      ? summary.destinations[0]
      : getDestSelectionState(verifiedDests, '').selectedValue
  ));
  const [nameDraft, setNameDraft] = useState(name ?? '');

  const currentDest = summary.kind === 'forward' ? summary.destinations[0] : null;
  const noDests = verifiedDests.length === 0;
  const canSave = choice !== 'forward' || Boolean(dest);

  function buildPatch(): RuleEditorPatch {
    const patch: RuleEditorPatch = {};

    if (choice === 'drop' && summary.kind !== 'drop') {
      patch.action = { type: 'drop' };
    }
    if (choice === 'forward' && dest && dest !== currentDest) {
      patch.action = { type: 'forward', value: [dest] };
    }
    if (name !== undefined && nameDraft.trim() !== '' && nameDraft.trim() !== name) {
      patch.name = nameDraft.trim();
    }

    return patch;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    onSave(buildPatch());
  }

  let preservedNotice = '';
  if (summary.kind === 'worker') {
    preservedNotice = summary.workerName
      ? t('rules.editor.workerNotice', { name: summary.workerName })
      : t('rules.editor.workerNoticeDefault');
  } else if (summary.kind === 'fanout') {
    preservedNotice = t('rules.editor.fanoutNotice', {
      addresses: summary.destinations.join(', '),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 bg-white/[0.02] px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]"
    >
      {preservedNotice && (
        <p className="m-0 text-[12.5px] leading-relaxed text-cream/60">
          {preservedNotice}{' '}
          <span className="text-accent-dark">{t('rules.editor.replaceWarning')}</span>
        </p>
      )}

      <fieldset className="m-0 flex flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0">
        <legend className="sr-only">{t('rules.editor.actionLabel')}</legend>
        {preserved && (
          <label className={radioLabelClass}>
            <input
              type="radio"
              name={`action-${summary.kind}`}
              checked={choice === 'keep'}
              onChange={() => setChoice('keep')}
              className="accent-accent"
            />
            {t('rules.editor.action.keep')}
          </label>
        )}
        <label className={radioLabelClass}>
          <input
            type="radio"
            name={`action-${summary.kind}`}
            checked={choice === 'forward'}
            onChange={() => setChoice('forward')}
            disabled={noDests}
            className="accent-accent disabled:cursor-not-allowed"
          />
          {t('rules.editor.action.forward')}
        </label>
        <label className={radioLabelClass}>
          <input
            type="radio"
            name={`action-${summary.kind}`}
            checked={choice === 'drop'}
            onChange={() => setChoice('drop')}
            className="accent-accent"
          />
          {t('rules.editor.action.drop')}
        </label>
      </fieldset>

      {choice === 'forward' && (
        noDests ? (
          <p className="m-0 font-mono text-xs text-accent-dark">
            {t('rules.editor.noVerifiedDests')}
          </p>
        ) : (
          <div className="relative">
            <select
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              aria-label={t('rules.editor.destLabel')}
              className={`${selectFieldClass} w-full truncate py-[7px] pl-3 pr-8 text-[13px]`}
            >
              {/* The configured destination may have lost its verification: it stays in
                  the list so the editor does not misrepresent what Cloudflare holds. */}
              {currentDest && !verifiedDests.some((d) => d.email === currentDest) && (
                <option value={currentDest}>{currentDest}</option>
              )}
              {verifiedDests.map((d) => (
                <option key={d.id} value={d.email} className="bg-surface text-cream">
                  {d.email}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cream/60"
              aria-hidden
            />
          </div>
        )
      )}

      {name !== undefined && (
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder={t('rules.editor.namePlaceholder')}
          aria-label={t('rules.editor.nameLabel')}
          className={`${textFieldClass} w-full px-3`}
        />
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className={pillButtonClass} disabled={busy || !canSave}>
          {t('rules.editor.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-[12.5px] text-cream/65 transition-colors duration-200 hover:text-cream"
        >
          {t('rules.editor.cancel')}
        </button>
      </div>
    </form>
  );
}
