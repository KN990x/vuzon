import { ArrowRight, Check, ChevronDown, Copy, Mail, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import type { Destination, Rule } from '../lib/types';
import { getRuleDest, getSingleForwardDestination } from '../lib/rules';
import { Switch } from './Switch';
import { CardIcon, pillButtonClass } from './primitives';

const ROW_DIVIDER = 'shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]';

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
    isRulePending, onToggleRule, onChangeRuleDest, onDeleteRule,
    newLocal, onLocalChange, onGenerate, previewText, copied, onCopyPreview,
    dest, onDestChange, verifiedDests, canCreate, loading, onCreate, aliasError,
  } = props;

  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2.5">
          <CardIcon>
            <Mail size={14} />
          </CardIcon>
          <span className="text-[15.5px] font-bold tracking-[-0.01em]">Alias</span>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <label className="flex min-w-0 items-center gap-2 text-cream/65">
            <Search size={13} className="flex-none" aria-hidden />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="buscar alias"
              aria-label="Buscar alias"
              className="w-28 min-w-0 font-mono text-xs text-cream placeholder:text-cream/45"
            />
          </label>
          <span className="flex-none font-mono text-[11px] text-cream/60">{totalCount} reglas</span>
        </div>
      </div>

      {rules.map((rule) => {
        const pending = isRulePending(rule.id);
        const enabled = Boolean(rule.enabled);
        // Only rules with a single `forward` are editable: see
        // getSingleForwardDestination. The rest (Worker, drop, multi-destination) render
        // as text so we do not destroy configuration made outside the panel.
        const currentDest = getSingleForwardDestination(rule);
        const editable = currentDest !== null && verifiedDests.length > 0;
        return (
          <div
            key={rule.id}
            className={`flex items-center gap-3.5 px-[18px] py-[13px] transition-opacity duration-[250ms] ${ROW_DIVIDER} ${
              enabled ? '' : 'opacity-45'
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-accent-soft">
              {rule.name}
            </span>
            <ArrowRight size={14} className="flex-none text-cream/65" aria-hidden />
            {editable ? (
              <div className="relative min-w-0 flex-1">
                <select
                  value={currentDest}
                  disabled={pending}
                  onChange={(e) => onChangeRuleDest(rule, e.target.value)}
                  aria-label={`Destino de ${rule.name ?? 'alias'}`}
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
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-cream/70">
                {getRuleDest(rule) || '—'}
              </span>
            )}
            <span
              className={`w-[72px] flex-none text-right font-mono text-[10px] uppercase tracking-[0.08em] ${
                enabled ? 'text-positive' : 'text-cream/60'
              }`}
            >
              {enabled ? 'activo' : 'pausado'}
            </span>
            <Switch
              on={enabled}
              disabled={pending}
              label={enabled ? 'Pausar alias' : 'Activar alias'}
              onToggle={() => onToggleRule(rule)}
            />
            <button
              type="button"
              onClick={() => onDeleteRule(rule.id)}
              disabled={pending}
              title="Eliminar alias"
              aria-label={`Eliminar ${rule.name ?? 'alias'}`}
              className="flex-none text-cream/65 transition-colors duration-200 hover:text-accent-dark disabled:cursor-wait disabled:opacity-60 disabled:hover:text-cream/65 enabled:cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
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
          placeholder="nuevo-alias"
          aria-label="Parte local del nuevo alias"
          className="w-[130px] font-mono text-[13px] text-cream placeholder:text-cream/45"
        />
        <span className="font-mono text-[13px] text-cream/60">@{domain || '...'}</span>
        <button
          type="button"
          onClick={onGenerate}
          title="Generar alias aleatorio"
          aria-label="Generar alias aleatorio"
          className="cursor-pointer text-cream/65 transition-colors duration-200 hover:text-accent"
        >
          <Shuffle size={14} />
        </button>
        <button
          type="button"
          onClick={onCopyPreview}
          title={`Copiar ${previewText}`}
          aria-label={`Copiar ${previewText}`}
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
            disabled={verifiedDests.length === 0}
            aria-label="Destino del nuevo alias"
            className="cursor-pointer appearance-none rounded-[10px] bg-white/[0.04] py-[7px] pl-3 pr-8 font-mono text-xs text-cream/75 disabled:cursor-not-allowed disabled:text-cream/65"
          >
            {verifiedDests.length === 0 && <option value="">sin destinos verificados</option>}
            {verifiedDests.map((d) => (
              <option key={d.id} value={d.email} className="bg-surface text-cream">
                {d.email}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/60"
            aria-hidden
          />
        </div>
        <button type="submit" className={pillButtonClass} disabled={!canCreate || loading}>
          Añadir alias
        </button>
        {aliasError && (
          <span className="w-full font-mono text-xs text-accent-dark">{aliasError}</span>
        )}
      </form>
    </section>
  );
}
