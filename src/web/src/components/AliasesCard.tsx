import { useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, Copy, Mail, Pencil, Plus, Search, Shuffle, Trash2,
} from 'lucide-react';
import type { Destination, Rule, RuleEditorPatch } from '../lib/types';
import { describeRuleActions, getRuleAlias, getRuleDest } from '../lib/rules';
import { useI18n } from '../i18n/context';
import { Switch } from './Switch';
import { RuleEditor } from './RuleEditor';
import { CardIcon, pillButtonClass, textFieldClass } from './primitives';

const ROW_DIVIDER = 'shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]';

/** Sentinel for the "discard the mail" entry of the create form's destination select. */
export const DROP_DEST_VALUE = '__drop__';

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
  onEditRule: (rule: Rule, patch: RuleEditorPatch) => Promise<void>;
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

  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2.5">
          <CardIcon>
            <Mail size={14} />
          </CardIcon>
          <span className="text-[15.5px] font-bold tracking-[-0.01em]">{t('aliases.title')}</span>
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
          <span className="flex-none font-mono text-[11px] text-cream/60">
            {tn('aliases.count', totalCount)}
          </span>
        </div>
      </div>

      {rules.map((rule) => {
        const pending = isRulePending(rule.id);
        const enabled = Boolean(rule.enabled);
        const summary = describeRuleActions(rule);
        // The dropdown is the fast path for the common case. Everything else (Worker,
        // drop, fan-out) is changed from the editor, where the consequences are spelled
        // out — and a rule whose action the panel cannot describe is not editable at all,
        // because a PUT would replace what we failed to understand.
        const quickSwap = summary.kind === 'forward' && verifiedDests.length > 0;
        const currentDest = summary.destinations[0];
        const editable = summary.kind !== 'unknown';
        const editing = editingId === rule.id;
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
          <div key={rule.id} className={ROW_DIVIDER}>
            <div
              className={`flex items-center gap-3.5 px-[18px] py-[13px] transition-opacity duration-[250ms] ${
                enabled ? '' : 'opacity-45'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate font-mono text-[13px] text-accent-soft">
                  {aliasName}
                </span>
                {showFreeName && (
                  <span className="block truncate font-mono text-[10px] text-cream/45">
                    {t('aliases.row.nameLabel', { name: freeName })}
                  </span>
                )}
              </span>
              <ArrowRight size={14} className="flex-none text-cream/65" aria-hidden />
              {quickSwap ? (
                <div className="relative min-w-0 flex-1">
                  <select
                    value={currentDest}
                    disabled={pending}
                    onChange={(e) => onChangeRuleDest(rule, e.target.value)}
                    aria-label={t('aliases.row.destLabel', { alias: aliasName })}
                    className="w-full cursor-pointer appearance-none truncate rounded-[8px] bg-white/[0.04] py-1 pl-2 pr-6 font-mono text-[13px] text-cream/70 disabled:cursor-wait disabled:opacity-60"
                  >
                    {/* The current destination may have become unverified: it is kept as an
                        option so we do not misrepresent what is configured in Cloudflare. */}
                    {!verifiedDests.some((d) => d.email === currentDest) && (
                      <option value={currentDest}>{currentDest}</option>
                    )}
                    {verifiedDests.map((d) => (
                      <option key={d.id} value={d.email} className="bg-surface text-cream">
                        {d.email}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-cream/60"
                    aria-hidden
                  />
                </div>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                  {kindBadge && (
                    <span
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
                disabled={pending}
                label={enabled ? t('aliases.row.pause') : t('aliases.row.enable')}
                onToggle={() => onToggleRule(rule)}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : rule.id)}
                  disabled={pending}
                  aria-expanded={editing}
                  title={t('aliases.row.edit')}
                  aria-label={t('aliases.row.editNamed', { alias: aliasName })}
                  className={`flex-none transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 enabled:cursor-pointer ${
                    editing ? 'text-accent' : 'text-cream/65 hover:text-accent'
                  }`}
                >
                  <Pencil size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDeleteRule(rule.id)}
                disabled={pending}
                title={t('aliases.row.delete')}
                aria-label={t('aliases.row.deleteNamed', { alias: aliasName })}
                className="flex-none text-cream/65 transition-colors duration-200 hover:text-accent-dark disabled:cursor-wait disabled:opacity-60 disabled:hover:text-cream/65 enabled:cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {editing && (
              <div className="fade-in">
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
                    void onEditRule(rule, patch).then(() => setEditingId(null));
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {rules.length === 0 && (
        <div className={`px-[18px] py-[13px] font-mono text-xs text-cream/60 ${ROW_DIVIDER}`}>
          {emptyMessage}
        </div>
      )}

      <form
        className="flex flex-wrap items-center gap-3 px-[18px] py-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
      >
        <span className="flex text-cream/65" aria-hidden>
          <Plus size={15} />
        </span>
        <input
          value={newLocal}
          onChange={(e) => onLocalChange(e.target.value)}
          placeholder={t('aliases.new.placeholder')}
          aria-label={t('aliases.new.label')}
          className={`${textFieldClass} w-[130px] text-[13px]`}
        />
        <span className="font-mono text-[13px] text-cream/60">@{domain || '...'}</span>
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
        <div className="relative ml-auto">
          <select
            value={dest}
            onChange={(e) => onDestChange(e.target.value)}
            aria-label={t('aliases.new.destLabel')}
            className="cursor-pointer appearance-none rounded-[10px] bg-white/[0.04] py-[7px] pl-3 pr-8 font-mono text-xs text-cream/75 disabled:cursor-not-allowed disabled:text-cream/65"
          >
            {verifiedDests.length === 0 && (
              <option value="">{t('aliases.new.noVerifiedDests')}</option>
            )}
            {verifiedDests.map((d) => (
              <option key={d.id} value={d.email} className="bg-surface text-cream">
                {d.email}
              </option>
            ))}
            {/* An alias that discards the mail: useful to make an address look valid
                without receiving anything. It rides in the same select rather than adding
                a control to a row that is already crowded. */}
            <option value={DROP_DEST_VALUE} className="bg-surface text-cream">
              {t('aliases.new.discard')}
            </option>
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/60"
            aria-hidden
          />
        </div>
        <button type="submit" className={pillButtonClass} disabled={!canCreate || loading}>
          {t('aliases.new.submit')}
        </button>
        {aliasError && (
          <span className="w-full font-mono text-xs text-accent-dark">{aliasError}</span>
        )}
      </form>
    </section>
  );
}
