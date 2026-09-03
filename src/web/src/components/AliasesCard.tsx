import { useId, useState } from 'react';
import {
  ArrowRight, Check, Copy, Mail, Pencil, Plus, Search, Shuffle, Trash2,
} from 'lucide-react';
import type { Destination, Rule, RuleEditorPatch } from '../lib/types';
import { DROP_DEST_VALUE } from '../lib/dest-selection';
import { describeRuleActions, getRuleAlias, getRuleDest } from '../lib/rules';
import { useI18n } from '../i18n/context';
import { Switch } from './Switch';
import { RuleEditor } from './RuleEditor';
import {
  CardIcon,
  cardTitleClass,
  formErrorClass,
  pillButtonClass,
  rowDeleteButtonClass,
  rowDividerClass,
  rowEditButtonClass,
  rowPaddingClass,
  SelectField,
  SelectOption,
  textFieldClass,
} from './primitives';

interface AliasesCardProps {
  domain: string;
  rules: Rule[];
  totalCount: number;
  emptyMessage: string;
  search: string;
  onSearchChange: (value: string) => void;
  isRulePending: (id: string) => boolean;
  onToggleRule: (rule: Rule) => void;
  onChangeRuleDest: (rule: Rule, destEmail: string) => void;
  onEditRule: (rule: Rule, patch: RuleEditorPatch) => Promise<boolean>;
  onDeleteRule: (id: string) => void;
  newLocal: string;
  onLocalChange: (value: string) => void;
  onGenerate: () => void;
  previewText: string;
  copied: boolean;
  onCopyPreview: () => void;
  dest: string;
  onDestChange: (value: string) => void;
  verifiedDests: Destination[];
  canCreate: boolean;
  loading: boolean;
  onCreate: () => void;
  aliasError: string;
}

export function AliasesCard(props: AliasesCardProps) {
  const {
    domain, rules, totalCount, emptyMessage, search, onSearchChange,
    isRulePending, onToggleRule, onChangeRuleDest, onEditRule, onDeleteRule,
    newLocal, onLocalChange, onGenerate, previewText, copied, onCopyPreview,
    dest, onDestChange, verifiedDests, canCreate, loading, onCreate, aliasError,
  } = props;

  const i18n = useI18n();
  const { t, tn } = i18n;
  // Only one row is expanded at a time: the editor is tall and two open at once turns the
  // list into a wall. `null` means every row is collapsed.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Prefix for the per-row editor ids that `aria-controls` points at.
  const editorIdPrefix = useId();
  const titleId = useId();
  const aliasErrorId = useId();

  return (
    // A <section> with no accessible name is not a landmark, and a <span> title is not a
    // heading — the whole dashboard exposed exactly one heading (the domain <h1>) and three
    // anonymous regions, which makes heading navigation useless. Naming the section from a
    // real <h2> fixes both at once.
    <section aria-labelledby={titleId} className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2.5">
          <CardIcon>
            <Mail size={14} />
          </CardIcon>
          <h2 id={titleId} className={`m-0 ${cardTitleClass}`}>{t('aliases.title')}</h2>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <label className="flex min-w-0 items-center gap-2 text-cream/65">
            <Search size={13} className="flex-none" aria-hidden />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('aliases.search.placeholder')}
              aria-label={t('aliases.search.label')}
              className={`${textFieldClass} w-28 min-w-0 text-xs`}
            />
          </label>
          {/* While a search is active the plain total read as a lie: "12 rules" over a
              one-row list. Show both numbers instead. */}
          <span className="flex-none font-mono text-[11px] text-cream/60">
            {search.trim() === ''
              ? tn('aliases.count', totalCount)
              : t('aliases.countFiltered', { shown: rules.length, total: totalCount })}
          </span>
        </div>
      </div>

      {/* A real list, not a stack of divs: without it nothing announces "list, 12 items" or
          "item 3 of 12", so a screen-reader user had no idea how many aliases there were or
          where they were in them. `list-none`/`m-0`/`p-0` keep the visual result identical. */}
      <ul role="list" className="m-0 list-none p-0">
        {rules.map((rule) => {
        const pending = isRulePending(rule.id);
        const enabled = Boolean(rule.enabled);
        const summary = describeRuleActions(rule);
        // The dropdown is the fast path for the common case. Everything else (Worker,
        // drop, fan-out) is changed from the editor, where the consequences are spelled
        // out — and a rule whose action the panel cannot describe is not editable at all,
        // because a PUT would replace what we failed to understand.
        const quickSwap = summary.kind === 'forward' && verifiedDests.length > 0;
        const currentDest = summary.destinations[0] ?? '';
        const editable = summary.kind !== 'unknown';
        const editing = editingId === rule.id;
        const editorId = `${editorIdPrefix}-${rule.id}`;
        const alias = getRuleAlias(rule);
        const aliasName = alias || t('aliases.row.fallbackName');
        const freeName = typeof rule.name === 'string' ? rule.name.trim() : '';
        const showFreeName = freeName !== '' && freeName !== alias;
        const kindBadge =
          summary.kind === 'worker'
            ? { key: 'aliases.row.badge.worker' as const, title: undefined }
            : summary.kind === 'fanout'
              ? { key: 'aliases.row.badge.fanout' as const, title: undefined }
              : summary.kind === 'unknown'
                ? {
                    key: 'aliases.row.badge.readOnly' as const,
                    title: t('rules.editor.unknownNotice'),
                  }
                : null;
        return (
          <li key={rule.id} className={rowDividerClass}>
            {/* A paused row is NOT dimmed. `opacity-45` over the row took the alias itself
                (13px, text-accent-soft) down to ~3.1:1, below AA, and paused aliases are
                exactly the ones a user scans for. The state is already carried by the
                active/paused label and the switch beside it. */}
            <div className={`flex items-center gap-3.5 ${rowPaddingClass}`}>
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate font-mono text-[13px] text-accent-soft">
                  {aliasName}
                </span>
                {showFreeName && (
                  <span className="block truncate font-mono text-[10px] text-cream/60">
                    {t('aliases.row.nameLabel', { name: freeName })}
                  </span>
                )}
              </span>
              <ArrowRight size={14} className="flex-none text-cream/65" aria-hidden />
              {quickSwap ? (
                <div className="min-w-0 flex-1">
                  <SelectField
                    compact
                    value={currentDest}
                    disabled={pending}
                    onChange={(e) => onChangeRuleDest(rule, e.target.value)}
                    aria-label={t('aliases.row.destLabel', { alias: aliasName })}
                    className="text-cream/70 disabled:cursor-wait disabled:opacity-60"
                  >
                    {/* The current destination may have become unverified: it is kept as an
                        option so we do not misrepresent what is configured in Cloudflare. */}
                    {!verifiedDests.some((d) => d.email === currentDest) && (
                      <SelectOption value={currentDest}>{currentDest}</SelectOption>
                    )}
                    {verifiedDests.map((d) => (
                      <SelectOption key={d.id} value={d.email}>{d.email}</SelectOption>
                    ))}
                  </SelectField>
                </div>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                  {kindBadge && (
                    <span
                      // The read-only badge's explanation used to live ONLY in a `title`,
                      // which never appears for a keyboard or touch user — and it is the
                      // one badge that explains why the row has no controls. It is exposed
                      // to assistive tech here and rendered visibly below the row too.
                      aria-label={kindBadge.title ? `${t(kindBadge.key)}: ${kindBadge.title}` : undefined}
                      title={kindBadge.title}
                      className="flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-cream/55"
                    >
                      {t(kindBadge.key)}
                    </span>
                  )}
                  <span className="min-w-0 truncate font-mono text-[13px] text-cream/70">
                    {getRuleDest(i18n, rule, summary) || '—'}
                  </span>
                </span>
              )}
              {/* Hidden on narrow screens: the switch beside it already says the same
                  thing, and its fixed 72px was squeezing the alias down to an ellipsis
                  once the row grew an edit button. */}
              <span
                className={`hidden w-[72px] flex-none text-right font-mono text-[10px] uppercase tracking-[0.08em] sm:block ${
                  enabled ? 'text-positive' : 'text-cream/60'
                }`}
              >
                {enabled ? t('aliases.row.active') : t('aliases.row.paused')}
              </span>
              <Switch
                on={enabled}
                busy={pending}
                // A rule whose action the panel cannot describe is not toggleable at all —
                // a different thing from "an update is in flight".
                disabled={!editable}
                label={enabled ? t('aliases.row.pause') : t('aliases.row.enable')}
                onToggle={() => onToggleRule(rule)}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : rule.id)}
                  disabled={pending}
                  aria-expanded={editing}
                  aria-controls={editing ? editorId : undefined}
                  title={t('aliases.row.edit')}
                  aria-label={t('aliases.row.editNamed', { alias: aliasName })}
                  className={rowEditButtonClass(editing)}
                >
                  <Pencil size={14} />
                </button>
              )}
              {/* Delete is offered even when the action is not describable: only EDITING is
                  unsafe there (a PUT would rewrite what the panel failed to read), and
                  hiding delete too left a corrupt rule removable only from Cloudflare's own
                  dashboard. The confirmation spells out what is unknown. */}
              <button
                type="button"
                onClick={() => onDeleteRule(rule.id)}
                disabled={pending}
                title={t('aliases.row.delete')}
                aria-label={t('aliases.row.deleteNamed', { alias: aliasName })}
                className={rowDeleteButtonClass}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {/* An unknown-action row has no switch and no edit (a PUT would rewrite what the
                panel failed to read), and nothing on screen said why — the explanation was
                hidden in a `title`. Deleting it IS allowed; the confirmation says so. */}
            {summary.kind === 'unknown' && (
              <p className={`m-0 pb-3 font-mono text-[10.5px] leading-relaxed text-cream/60 ${rowPaddingClass} pt-0`}>
                {t('rules.editor.unknownNotice')}
              </p>
            )}
            {editing && (
              <div className="fade-in" id={editorId}>
                <RuleEditor
                  // Remounts on a refresh so the draft always starts from what Cloudflare
                  // holds, never from a stale copy of the row.
                  key={`${rule.id}:${summary.kind}:${summary.destinations.join(',')}`}
                  summary={summary}
                  verifiedDests={verifiedDests}
                  busy={pending}
                  name={rule.name ?? ''}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    // Collapse only on success: updateRule resolves false when the save fails.
                    void onEditRule(rule, patch).then((ok) => {
                      if (ok) setEditingId(null);
                    });
                  }}
                />
              </div>
            )}
          </li>
        );
        })}
      </ul>

      {rules.length === 0 && emptyMessage !== '' && (
        <div className={`${rowPaddingClass} font-mono text-xs text-cream/60 ${rowDividerClass}`}>
          {emptyMessage}
        </div>
      )}

      <form
        className={`flex flex-col gap-3 ${rowPaddingClass}`}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex text-cream/65" aria-hidden>
            <Plus size={15} />
          </span>
          <input
            value={newLocal}
            onChange={(e) => onLocalChange(e.target.value)}
            placeholder={t('aliases.new.placeholder')}
            aria-label={t('aliases.new.label')}
            aria-invalid={aliasError ? true : undefined}
            aria-describedby={aliasError ? aliasErrorId : undefined}
            className={`${textFieldClass} min-w-0 flex-1 text-[13px] sm:w-[130px] sm:flex-none`}
          />
          <span className="font-mono text-[13px] text-cream/60">@{domain || '…'}</span>
          <button
            type="button"
            onClick={onGenerate}
            title={t('aliases.new.generate')}
            aria-label={t('aliases.new.generate')}
            className="cursor-pointer text-cream/65 transition-colors duration-200 hover:text-accent"
          >
            <Shuffle size={14} />
          </button>
          <button
            type="button"
            onClick={onCopyPreview}
            title={t('aliases.new.copy', { address: previewText })}
            aria-label={t('aliases.new.copy', { address: previewText })}
            className={`cursor-pointer transition-colors duration-200 ${
              copied ? 'text-positive' : 'text-cream/65 hover:text-accent'
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 w-full sm:flex-1">
            <SelectField
              value={dest}
              onChange={(e) => onDestChange(e.target.value)}
              aria-label={t('aliases.new.destLabel')}
              className="rounded-[10px]"
            >
              {verifiedDests.length === 0 && (
                <SelectOption value="">{t('aliases.new.noVerifiedDests')}</SelectOption>
              )}
              {verifiedDests.map((d) => (
                <SelectOption key={d.id} value={d.email}>{d.email}</SelectOption>
              ))}
              {/* An alias that discards the mail: useful to make an address look valid
                  without receiving anything. It rides in the same select rather than adding
                  a control to a row that is already crowded. */}
              <SelectOption value={DROP_DEST_VALUE}>{t('aliases.new.discard')}</SelectOption>
            </SelectField>
          </div>
          <button
            type="submit"
            className={`${pillButtonClass} w-full sm:w-auto`}
            disabled={!canCreate || loading}
          >
            {t('aliases.new.submit')}
          </button>
        </div>
        {/* role="alert": alias errors (charset, duplicate, unverified destination) land in
            card state rather than the toast, so without a live region a screen-reader user
            was told nothing at all while the submit button quietly re-enabled. */}
        {aliasError && <p id={aliasErrorId} role="alert" className={formErrorClass}>{aliasError}</p>}
      </form>
    </section>
  );
}
