import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { Destination, RuleEditorPatch } from '../lib/types';
import type { RuleActionSummary } from '../lib/rules';
import { getDestSelectionState } from '../lib/dest-selection';
import type { ActionChoice } from '../lib/rule-patch';
import {
  buildRulePatch,
  currentForwardDestination,
  initialActionChoice,
} from '../lib/rule-patch';
import { useI18n } from '../i18n/context';
import {
  formErrorClass,
  pillButtonClass,
  SelectField,
  SelectOption,
  textFieldClass,
} from './primitives';

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

const radioLabelClass = 'flex cursor-pointer items-center gap-2 text-[12.5px] text-cream/75';

export function RuleEditor({ summary, verifiedDests, busy, name, onSave, onCancel }: RuleEditorProps) {
  const { t } = useI18n();
  // An alias-row editor and the catch-all editor can be open at the same time. Naming the
  // radio group after `summary.kind` made two `forward` rules share one DOM group, so
  // picking "Discard it" in one visually unchecked the other while its React state still
  // said 'forward' — the rendered form and the patch disagreed.
  const groupName = `${useId()}-action`;

  const preserved = summary.kind === 'worker' || summary.kind === 'fanout';
  const [choice, setChoice] = useState<ActionChoice>(() => initialActionChoice(summary));
  // The configured address wins even if it lost its verification: the editor shows what
  // Cloudflare holds. With nothing configured, fall back to the first verified one.
  const [dest, setDest] = useState(() => (
    summary.kind === 'forward'
      // `?? ''` for the same reason as currentForwardDestination: 'forward' implies one
      // destination by construction, but that is a module invariant, not a type.
      ? summary.destinations[0] ?? ''
      : getDestSelectionState(verifiedDests, '').selectedValue
  ));
  const [nameDraft, setNameDraft] = useState(name ?? '');

  const currentDest = currentForwardDestination(summary);
  const noDests = verifiedDests.length === 0;
  const canSave = choice !== 'forward' || Boolean(dest);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    onSave(buildRulePatch({ summary, choice, dest, name, nameDraft }));
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
              name={groupName}
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
            name={groupName}
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
            name={groupName}
            checked={choice === 'drop'}
            onChange={() => setChoice('drop')}
            className="accent-accent"
          />
          {t('rules.editor.action.drop')}
        </label>
      </fieldset>

      {choice === 'forward' && (
        noDests ? (
          <p className={formErrorClass}>{t('rules.editor.noVerifiedDests')}</p>
        ) : (
          <SelectField
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            aria-label={t('rules.editor.destLabel')}
          >
            {/* The configured destination may have lost its verification: it stays in
                the list so the editor does not misrepresent what Cloudflare holds. */}
            {currentDest && !verifiedDests.some((d) => d.email === currentDest) && (
              <SelectOption value={currentDest}>{currentDest}</SelectOption>
            )}
            {verifiedDests.map((d) => (
              <SelectOption key={d.id} value={d.email}>{d.email}</SelectOption>
            ))}
          </SelectField>
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
