import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, UnauthorizedError } from '../lib/api';
import { copyTextToClipboard } from '../lib/clipboard';
import { getDestSelectionState } from '../lib/dest-selection';
import {
  describeRuleActions,
  filterAliasRules,
  findAliasesUsingDestination,
  generateRandomLocalPart,
  getSingleForwardDestination,
  interpretAddDestError,
} from '../lib/rules';
import { isVerifiedStatus } from '../lib/verification';
import type { CatchAllPatch, Destination, FormErrors, Profile, Rule, RulePatch } from '../lib/types';
import { useI18n } from '../i18n/context';
import { translateApiError } from '../i18n/api-errors';
import { Header } from '../components/Header';
import { ChangePasswordDialog } from '../components/ChangePasswordDialog';
import { Footer } from '../components/Footer';
import { Toast } from '../components/Toast';
import { AliasesCard, DROP_DEST_VALUE } from '../components/AliasesCard';
import { CatchAllCard } from '../components/CatchAllCard';
import { DestinationsCard } from '../components/DestinationsCard';

// /api/me is not listed here: rootDomain comes from the server environment and does
// not change during the session, so it is fetched once on mount.
const REFRESH_ENDPOINTS = [
  { path: '/api/rules', labelKey: 'dashboard.resource.rules' },
  { path: '/api/addresses', labelKey: 'dashboard.resource.addresses' },
  { path: '/api/rules/catch-all', labelKey: 'dashboard.resource.catchAll' },
] as const;

interface ListResponse<T> {
  result?: T;
}

export function Dashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [profile, setProfile] = useState<Profile>({ rootDomain: '' });
  const [rules, setRules] = useState<Rule[]>([]);
  const [dests, setDests] = useState<Destination[]>([]);
  const [catchAll, setCatchAll] = useState<Rule | null>(null);
  // A single boolean locked the whole UI: adding a destination also disabled creating
  // aliases and refreshing. Each operation now occupies its own key.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const [search, setSearch] = useState('');
  const [newAlias, setNewAlias] = useState({ local: '', dest: '' });
  const [newDestInput, setNewDestInput] = useState('');

  // The toast holds already-translated text: it lives ~5s, so re-translating it on a
  // language switch would be pointless machinery. Form errors do NOT — they stay on
  // screen until the next attempt, so they are kept raw and translated at render.
  const [statusMsg, setStatusMsg] = useState('');
  const [errors, setErrors] = useState<FormErrors>({ alias: null, dest: null });
  const [copied, setCopied] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const statusTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const refreshDepthRef = useRef(0);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  // Same trick as onUnauthorizedRef: keeping the translator out of the callback deps
  // stops a language switch from re-running `refreshAll` and refetching everything.
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  useEffect(
    () => () => {
      if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const addBusy = useCallback((key: string) => {
    setBusy((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const removeBusy = useCallback((key: string) => {
    setBusy((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /** Status toast with auto-clear after ~5s. */
  const setStatus = useCallback((message: string) => {
    setStatusMsg(message);
    if (statusTimerRef.current != null) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMsg('');
    }, 5000);
  }, []);

  /** Any 401 goes back to login through client state (no server redirect). */
  const api = useCallback(
    async <T,>(path: string, method = 'GET', body: Record<string, unknown> | null = null) => {
      try {
        return await apiRequest<T>(path, method, body);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorizedRef.current();
        }
        throw err;
      }
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    // `refreshAll` is called nested from the mutations; the counter keeps the inner
    // refresh from switching the indicator off while the outer one is still running.
    // On a clean load it also clears `status` — mutation success toasts must be set
    // *after* awaiting this, or they flash and disappear.
    refreshDepthRef.current += 1;
    if (refreshDepthRef.current === 1) {
      addBusy('refresh');
    }

    try {
      const results = await Promise.allSettled(REFRESH_ENDPOINTS.map((e) => api<unknown>(e.path)));
      const failures: string[] = [];
      let nextDests: Destination[] | null = null;

      results.forEach((result, i) => {
        const { path, labelKey } = REFRESH_ENDPOINTS[i];
        if (result.status !== 'fulfilled') {
          if (path === '/api/rules/catch-all') {
            setCatchAll(null);
          }
          const msg = translateApiError(i18nRef.current, result.reason);
          failures.push(`${i18nRef.current.t(labelKey)}: ${msg}`);
          return;
        }

        if (path === '/api/rules') {
          setRules((result.value as ListResponse<Rule[]>)?.result || []);
        } else if (path === '/api/addresses') {
          nextDests = (result.value as ListResponse<Destination[]>)?.result || [];
          setDests(nextDests);
        } else if (path === '/api/rules/catch-all') {
          setCatchAll((result.value as ListResponse<Rule>)?.result ?? null);
        }
      });

      if (nextDests) {
        const list = nextDests;
        setNewAlias((prev) => ({
          ...prev,
          dest: getDestSelectionState(list, prev.dest).selectedValue,
        }));
      }

      if (failures.length > 0) {
        setStatus(i18nRef.current.t('dashboard.status.partialLoad', {
          details: failures.join(' · '),
        }));
      } else {
        setStatus('');
      }
    } finally {
      refreshDepthRef.current = Math.max(0, refreshDepthRef.current - 1);
      if (refreshDepthRef.current === 0) {
        removeBusy('refresh');
      }
    }
  }, [api, setStatus, addBusy, removeBusy]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Profile: once on mount (see the comment on REFRESH_ENDPOINTS).
  useEffect(() => {
    let cancelled = false;

    api<Profile>('/api/me')
      .then((value) => {
        if (!cancelled) setProfile(value || { rootDomain: '' });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(i18nRef.current.t('dashboard.status.profileError', {
            message: translateApiError(i18nRef.current, err),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, setStatus]);

  // Derived values (same criteria as the documented Alpine client).
  const verifiedDests = dests.filter((dest) => isVerifiedStatus(dest.verified));

  const aliasRules = filterAliasRules(rules, catchAll);
  const filteredRules = filterAliasRules(rules, catchAll, search);

  let aliasListEmptyMessage = '';
  if (filteredRules.length === 0) {
    if (search) {
      aliasListEmptyMessage = t('aliases.empty.noResults');
    } else if (catchAll) {
      aliasListEmptyMessage = t('aliases.empty.onlyCatchAll');
    } else if (rules.length === 0) {
      aliasListEmptyMessage = t('aliases.empty.none');
    } else {
      aliasListEmptyMessage = t('aliases.empty.noResults');
    }
  }

  const normalizedLocalPart = newAlias.local.trim().toLowerCase();
  const previewText = `${normalizedLocalPart || 'alias'}@${profile.rootDomain || '...'}`;
  const droppingNewAlias = newAlias.dest === DROP_DEST_VALUE;
  const canCreateAlias = Boolean(
    normalizedLocalPart &&
      profile.rootDomain &&
      (droppingNewAlias || verifiedDests.some((dest) => dest.email === newAlias.dest)),
  );

  const activeCount = aliasRules.filter((rule) => rule.enabled).length;
  const catchAllLabel = catchAll === null ? '—' : catchAll.enabled ? 'ON' : 'OFF';

  function clearErrors() {
    setErrors({ alias: null, dest: null });
  }

  /** Shorthand for the many `setStatus('Error: …')` call sites. */
  function setErrorStatus(err: unknown) {
    setStatus(t('dashboard.status.error', { message: translateApiError(i18n, err) }));
  }

  async function logout() {
    try {
      await apiRequest('/api/logout', 'POST');
    } catch (err) {
      console.error(err);
    }
    onUnauthorized();
  }

  /**
   * Runs `run` under the key `key`, ignoring the call if that operation is already in
   * flight. It replaces the repeated manual guards (double submit with Enter, two quick
   * clicks on delete that fired two DELETEs and a spurious error toast).
   */
  async function runExclusive(key: string, run: () => Promise<void>) {
    if (busy.has(key)) {
      return;
    }
    addBusy(key);
    try {
      await run();
    } finally {
      removeBusy(key);
    }
  }

  async function createAlias() {
    if (!canCreateAlias) {
      return;
    }

    await runExclusive('create-alias', async () => {
      clearErrors();
      const localPart = normalizedLocalPart;
      setNewAlias((prev) => ({ ...prev, local: localPart }));

      const action = droppingNewAlias
        ? { type: 'drop' as const }
        : { type: 'forward' as const, value: [newAlias.dest] };

      try {
        await api('/api/rules', 'POST', { localPart, action });
        setNewAlias((prev) => ({ ...prev, local: '' }));
        await refreshAll();
        setStatus(t('dashboard.status.aliasCreated'));
      } catch (err) {
        setErrors((prev) => ({ ...prev, alias: err }));
      }
    });
  }

  async function addDest() {
    if (!newDestInput) {
      return;
    }

    await runExclusive('add-dest', async () => {
      clearErrors();
      try {
        await api('/api/addresses', 'POST', { email: newDestInput });
        setNewDestInput('');
        await refreshAll();
        setStatus(t('dashboard.status.destAdded'));
      } catch (err) {
        setErrors((prev) => ({ ...prev, dest: err }));
      }
    });
  }

  async function toggleRule(rule: Rule) {
    await runExclusive(`rule:${rule.id}`, async () => {
      try {
        const action = rule.enabled ? 'disable' : 'enable';
        await api(`/api/rules/${rule.id}/${action}`, 'POST');
        await refreshAll();
        setStatus(t('dashboard.status.aliasUpdated'));
      } catch (err) {
        setErrorStatus(err);
      }
    });
  }

  async function changeRuleDest(rule: Rule, destEmail: string) {
    if (!destEmail || destEmail === getSingleForwardDestination(rule)) {
      return;
    }

    await updateRule(rule, { action: { type: 'forward', value: [destEmail] } });
  }

  /**
   * Patch of an existing rule. An omitted field is preserved server-side, so this is also
   * the safe way to rename or pause a rule whose action the panel does not write itself.
   *
   * Replacing a Worker or fan-out action is confirmed first: the PUT overwrites `actions`
   * wholesale and vuzon cannot put back what it did not create.
   */
  async function updateRule(rule: Rule, patch: RulePatch) {
    if (Object.keys(patch).length === 0) {
      return;
    }

    const { kind } = describeRuleActions(rule);
    const replacesForeignAction = patch.action !== undefined
      && (kind === 'worker' || kind === 'fanout');
    if (replacesForeignAction && !window.confirm(t('rules.editor.confirmReplace'))) {
      return;
    }

    await runExclusive(`rule:${rule.id}`, async () => {
      try {
        await api(`/api/rules/${rule.id}`, 'PUT', patch);
        await refreshAll();
        setStatus(t(patch.action ? 'dashboard.status.destUpdated' : 'dashboard.status.aliasUpdated'));
      } catch (err) {
        setErrorStatus(err);
      }
    });
  }

  async function updateCatchAll(patch: CatchAllPatch) {
    if (Object.keys(patch).length === 0) {
      return;
    }

    const { kind } = describeRuleActions(catchAll);
    if (
      patch.action !== undefined
      && (kind === 'worker' || kind === 'fanout')
      && !window.confirm(t('rules.editor.confirmReplace'))
    ) {
      return;
    }
    // Pausing it is not a small change: mail to an address with no alias stops being
    // accepted at all, and nothing on screen would say so afterwards.
    if (patch.enabled === false && !window.confirm(t('catchAll.confirmDisable'))) {
      return;
    }

    await runExclusive('catch-all', async () => {
      try {
        await api('/api/rules/catch-all', 'PUT', patch);
        await refreshAll();
        setStatus(t('dashboard.status.catchAllUpdated'));
      } catch (err) {
        setErrorStatus(err);
      }
    });
  }

  async function deleteRule(id: string) {
    if (busy.has(`rule:${id}`)) {
      return;
    }
    if (!window.confirm(t('dashboard.confirm.deleteAlias'))) {
      return;
    }

    await runExclusive(`rule:${id}`, async () => {
      try {
        await api(`/api/rules/${id}`, 'DELETE');
        // Optimistic filtering for immediate visual feedback; refreshAll re-syncs the rest.
        setRules((prev) => prev.filter((rule) => rule.id !== id));
        await refreshAll();
        setStatus(t('dashboard.status.aliasDeleted'));
      } catch (err) {
        await refreshAll();
        setErrorStatus(err);
      }
    });
  }

  async function deleteDest(id: string) {
    if (busy.has(`dest:${id}`)) {
      return;
    }

    const dest = dests.find((entry) => entry.id === id);
    const aliasesInUse = dest
      ? findAliasesUsingDestination(rules, dest.email, catchAll)
      : [];
    const confirmMessage = aliasesInUse.length > 0
      ? t('dashboard.confirm.deleteDestInUse', { aliases: aliasesInUse.join(', ') })
      : t('dashboard.confirm.deleteDest');
    if (!window.confirm(confirmMessage)) {
      return;
    }

    await runExclusive(`dest:${id}`, async () => {
      try {
        await api(`/api/addresses/${id}`, 'DELETE');
        await refreshAll();
        setStatus(t('dashboard.status.destDeleted'));
      } catch (err) {
        setErrorStatus(err);
      }
    });
  }

  function generateLocalPart() {
    setNewAlias((prev) => ({ ...prev, local: generateRandomLocalPart() }));
    clearErrors();
  }

  function handleLocalChange(value: string) {
    setNewAlias((prev) => ({ ...prev, local: value.trim().toLowerCase() }));
    clearErrors();
  }

  async function copyPreview() {
    if (!profile.rootDomain) {
      return;
    }

    const result = await copyTextToClipboard(previewText, t('dashboard.copyPrompt'));
    if (result.copied) {
      setCopied(true);
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
    if (result.failed) {
      setStatus(t('dashboard.status.copyFailed'));
    }
  }

  return (
    <div className="min-h-screen bg-ink font-sans text-cream">
      <Header
        domain={profile.rootDomain}
        loading={busy.has('refresh')}
        onRefresh={() => void refreshAll()}
        onChangePassword={() => setChangingPassword(true)}
        onLogout={() => void logout()}
      />
      {changingPassword && (
        <ChangePasswordDialog
          onClose={() => setChangingPassword(false)}
          onChanged={() => {
            setChangingPassword(false);
            setStatus(t('account.password.done'));
          }}
        />
      )}
      {/* pb-12 instead of pb-20: the footer now supplies the missing breathing room. */}
      <main className="fade-in mx-auto max-w-[1180px] px-6 pb-12 pt-[104px]">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-cream/65">
              {t('dashboard.eyebrow')}
            </div>
            <h1 className="m-0 text-[34px] font-bold tracking-[-0.035em]">
              {profile.rootDomain || '…'}
            </h1>
          </div>
          <div className="flex gap-6 font-mono text-xs text-cream/65">
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans text-[22px] font-bold text-cream">{activeCount}</span>
              {t('dashboard.activeAliases')}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans text-[22px] font-bold text-accent">{catchAllLabel}</span>
              {t('dashboard.catchAll')}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <AliasesCard
              domain={profile.rootDomain}
              rules={filteredRules}
              totalCount={aliasRules.length}
              emptyMessage={aliasListEmptyMessage}
              search={search}
              onSearchChange={setSearch}
              isRulePending={(id) => busy.has(`rule:${id}`)}
              onToggleRule={(rule) => void toggleRule(rule)}
              onChangeRuleDest={(rule, destEmail) => void changeRuleDest(rule, destEmail)}
              onEditRule={updateRule}
              onDeleteRule={(id) => void deleteRule(id)}
              newLocal={newAlias.local}
              onLocalChange={handleLocalChange}
              onGenerate={generateLocalPart}
              previewText={previewText}
              copied={copied}
              onCopyPreview={() => void copyPreview()}
              dest={newAlias.dest}
              onDestChange={(value) => {
                setNewAlias((prev) => ({ ...prev, dest: value }));
                clearErrors();
              }}
              verifiedDests={verifiedDests}
              canCreate={canCreateAlias}
              loading={busy.has('create-alias')}
              onCreate={() => void createAlias()}
              aliasError={errors.alias === null ? '' : translateApiError(i18n, errors.alias)}
            />
          </div>
          <div className="flex w-full flex-none flex-col gap-6 lg:w-80">
            <CatchAllCard
              catchAll={catchAll}
              verifiedDests={verifiedDests}
              busy={busy.has('catch-all')}
              onToggle={() => void updateCatchAll({ enabled: !catchAll?.enabled })}
              onEdit={updateCatchAll}
            />
            <DestinationsCard
              dests={dests}
              newDestInput={newDestInput}
              onInputChange={(value) => {
                setNewDestInput(value);
                clearErrors();
              }}
              onAdd={() => void addDest()}
              onDelete={(id) => void deleteDest(id)}
              loading={busy.has('add-dest')}
              isDestPending={(id) => busy.has(`dest:${id}`)}
              error={errors.dest === null ? '' : interpretAddDestError(i18n, errors.dest)}
            />
          </div>
        </div>
      </main>
      <Footer />
      <Toast message={statusMsg} />
    </div>
  );
}
