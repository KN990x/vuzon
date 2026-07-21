import { useState } from 'react';
import { Activity, ArrowRight, Pencil } from 'lucide-react';
import type { Destination, Rule, RuleEditorPatch } from '../lib/types';
import { describeRuleActions, getRuleDest } from '../lib/rules';
import { useI18n } from '../i18n/context';
import { Switch } from './Switch';
import { RuleEditor } from './RuleEditor';
import { CardIcon, chipClass } from './primitives';

interface CatchAllCardProps {
  catchAll: Rule | null;
  verifiedDests: Destination[];
  busy: boolean;
  onToggle: () => void;
  onEdit: (patch: RuleEditorPatch) => Promise<void>;
}

/**
 * Catch-all card.
 *
 * The rule can be paused and its action changed, but never renamed, re-matched or
 * deleted: `PUT /api/rules/catch-all` forces `matchers: [{ type: 'all' }]` and there is no
 * DELETE. A catch-all that stopped catching everything would blackhole mail in silence,
 * so that part is not the panel's to offer.
 */
export function CatchAllCard({ catchAll, verifiedDests, busy, onToggle, onEdit }: CatchAllCardProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const [editing, setEditing] = useState(false);

  const enabled = Boolean(catchAll?.enabled);
  const summary = describeRuleActions(catchAll);
  const destText = getRuleDest(i18n, catchAll, summary);
  const editable = catchAll !== null && summary.kind !== 'unknown';

  let stateLabel = t('catchAll.state.unavailable');
  if (catchAll !== null) {
    stateLabel = enabled ? t('catchAll.state.active') : t('catchAll.state.paused');
  }

  return (
    <section className="glass relative rounded-panel p-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <CardIcon>
            <Activity size={14} />
          </CardIcon>
          <span className="truncate text-[15px] font-bold tracking-[-0.01em]">
            {t('catchAll.title')}
          </span>
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
              disabled={busy}
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
              title={t('catchAll.edit')}
              aria-label={t('catchAll.edit')}
              className={`flex-none transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 enabled:cursor-pointer ${
                editing ? 'text-accent' : 'text-cream/65 hover:text-accent'
              }`}
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
        <div className="fade-in -mx-2 overflow-hidden rounded-[10px]">
          <RuleEditor
            key={`${summary.kind}:${summary.destinations.join(',')}`}
            summary={summary}
            verifiedDests={verifiedDests}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
              void onEdit(patch).then(() => setEditing(false));
            }}
          />
        </div>
      ) : (
        <div className={`${chipClass} ${enabled ? 'text-cream/75' : 'text-cream/65'}`}>
          <ArrowRight size={13} className="flex-none" aria-hidden />
          <span className="min-w-0 truncate">
            {catchAll === null ? t('catchAll.loadError') : destText || t('catchAll.noAction')}
          </span>
        </div>
      )}
    </section>
  );
}
