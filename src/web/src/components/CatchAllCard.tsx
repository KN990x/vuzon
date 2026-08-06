import { useId, useState } from 'react';
import { Activity, ArrowRight, Pencil } from 'lucide-react';
import type { Destination, Rule, RuleEditorPatch } from '../lib/types';
import { describeRuleActions, getRuleDest } from '../lib/rules';
import { useI18n } from '../i18n/context';
import { Switch } from './Switch';
import { RuleEditor } from './RuleEditor';
import { CardIcon, cardTitleClass, chipClass, rowEditButtonClass } from './primitives';

interface CatchAllCardProps {
  catchAll: Rule | null;
  /** False until the first refresh comes back; see the note on the card below. */
  loaded: boolean;
  verifiedDests: Destination[];
  busy: boolean;
  onToggle: () => void;
  onEdit: (patch: RuleEditorPatch) => Promise<boolean>;
}

/**
 * Catch-all card.
 *
 * The rule can be paused and its action changed, but never renamed, re-matched or
 * deleted: `PUT /api/rules/catch-all` forces `matchers: [{ type: 'all' }]` and there is no
 * DELETE. A catch-all that stopped catching everything would blackhole mail in silence,
 * so that part is not the panel's to offer.
 *
 * `catchAll === null` alone could not say WHY there is no rule, so the very first paint —
 * before the fetch had even resolved — announced "Could not load the catch-all rule".
 * `loaded` separates "not fetched yet" from "fetched, and there is nothing".
 */
export function CatchAllCard({ catchAll, loaded, verifiedDests, busy, onToggle, onEdit }: CatchAllCardProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const [editing, setEditing] = useState(false);
  const editorId = useId();
  const titleId = useId();

  const enabled = Boolean(catchAll?.enabled);
  const summary = describeRuleActions(catchAll);
  const destText = getRuleDest(i18n, catchAll, summary);
  const editable = catchAll !== null && summary.kind !== 'unknown';

  let stateLabel = t('catchAll.state.unavailable');
  if (!loaded) {
    stateLabel = t('catchAll.state.loading');
  } else if (catchAll !== null) {
    stateLabel = enabled ? t('catchAll.state.active') : t('catchAll.state.paused');
  }

  let chipText = destText || t('catchAll.noAction');
  if (!loaded) {
    chipText = t('app.loading');
  } else if (catchAll === null) {
    chipText = t('catchAll.loadError');
  }

  return (
    // Named landmark + real heading: see the comment in AliasesCard.
    <section aria-labelledby={titleId} className="glass relative rounded-card p-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <CardIcon>
            <Activity size={14} />
          </CardIcon>
          <h2 id={titleId} className={`m-0 truncate ${cardTitleClass}`}>{t('catchAll.title')}</h2>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
              catchAll !== null && enabled ? 'text-positive' : 'text-cream/60'
            }`}
          >
            {stateLabel}
          </span>
          {catchAll !== null && (
            <Switch
              on={enabled}
              busy={busy}
              label={enabled ? t('catchAll.toggle.pause') : t('catchAll.toggle.enable')}
              onToggle={onToggle}
            />
          )}
          {editable && (
            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              disabled={busy}
              aria-expanded={editing}
              aria-controls={editing ? editorId : undefined}
              title={t('catchAll.edit')}
              aria-label={t('catchAll.edit')}
              className={rowEditButtonClass(editing)}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-cream/60">
        {t('catchAll.description')}
      </p>
      {editing ? (
        <div className="fade-in -mx-2 overflow-hidden rounded-[10px]" id={editorId}>
          <RuleEditor
            key={`${summary.kind}:${summary.destinations.join(',')}`}
            summary={summary}
            verifiedDests={verifiedDests}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
              // Collapse only on success: updateCatchAll resolves false when the save fails.
              void onEdit(patch).then((ok) => {
                if (ok) setEditing(false);
              });
            }}
          />
        </div>
      ) : (
        <div className={`${chipClass} ${enabled ? 'text-cream/75' : 'text-cream/65'}`}>
          <ArrowRight size={13} className="flex-none" aria-hidden />
          <span className="min-w-0 truncate">{chipText}</span>
        </div>
      )}
    </section>
  );
}
