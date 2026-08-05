import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, UnauthorizedError } from '../lib/api';
import { copyTextToClipboard } from '../lib/clipboard';
import { DROP_DEST_VALUE, getDestSelectionState } from '../lib/dest-selection';
import {
  describeRuleActions,
  filterAliasRules,
  findAliasesUsingDestination,
  generateRandomLocalPart,
  getSingleForwardDestination,
  interpretAddDestError,
} from '../lib/rules';
import { replacesForeignAction } from '../lib/rule-patch';
import { isVerifiedStatus } from '../lib/verification';
import type { CatchAllPatch, Destination, FormErrors, Profile, Rule, RulePatch } from '../lib/types';
import { useI18n } from '../i18n/context';
import { translateApiError } from '../i18n/api-errors';
import { Header } from '../components/Header';
import { AccountDialog } from '../components/AccountDialog';
import type { AccountChangeKind } from '../components/AccountDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ConfirmRequest } from '../components/ConfirmDialog';
import { Footer } from '../components/Footer';
import { Toast } from '../components/Toast';
import { AliasesCard } from '../components/AliasesCard';
import { CatchAllCard } from '../components/CatchAllCard';
import { DestinationsCard } from '../components/DestinationsCard';
import { pillButtonClass } from '../components/primitives';

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
  const [profile, setProfile] = useState<Profile>({ rootDomain: '', username: '' });
  const [rules, setRules] = useState<Rule[]>([]);
  const [dests, setDests] = useState<Destination[]>([]);
  const [catchAll, setCatchAll] = useState<Rule | null>(null);
  // `null` alone could not tell "not fetched yet" from "the fetch failed" or "there is no
  // catch-all", so the very first paint rendered the catch-all card's error message and the
  // lists rendered their empty states. Set once the first refresh has come back.
  const [loaded, setLoaded] = useState(false);
  /** Per-resource failures of the last refresh, already translated. Empty when all is well. */
  const [loadFailures, setLoadFailures] = useState<string[]>([]);
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
  const [accountMode, setAccountMode] = useState<AccountChangeKind | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const statusTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const refreshDepthRef = useRef(0);
  // Generation token for `refreshAll`. Three endpoints are fetched concurrently and the
  // results are written as they land, so two overlapping refreshes used to race: pressing
  // Refresh and then toggling a rule let the FIRST refresh's pre-toggle rules resolve last
  // and overwrite the fresh state — the switch visibly flipped back.
  const refreshGenerationRef = useRef(0);
  /** Authoritative in-flight set for `runExclusive` (see the comment there). */
  const inFlightRef = useRef<Set<string>>(new Set());
  /** Resolver of the confirm currently on screen; see `askConfirm`. */
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  // Flipped by the unmount cleanup. A 401 sends App back to the login screen while requests
  // are still in flight; without this, their `.then` handlers kept calling setState (and
  // `setStatus` registered a brand-new timer that nothing would ever clear).
  const mountedRef = useRef(true);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const i18nRef = useRef(i18n);

  // Refs are synced in an effect, not during render: a render that React throws away must
  // not leave a mutated ref behind.
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
    // Same trick as onUnauthorizedRef: keeping the translator out of the callback deps
    // stops a language switch from re-running `refreshAll` and refetching everything.
    i18nRef.current = i18n;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
      // An unanswered confirm would leave its caller awaiting forever, holding a busy key
      // on a screen that no longer exists.
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = null;
    };
  }, []);

  /**
   * Asks the user, through the panel's own modal, and resolves with their answer.
   *
   * `window.confirm` was doing this synchronously, but it renders its OK/Cancel in the
   * BROWSER's language rather than the panel's, blocks the main thread, and is a silent
   * no-op in a sandboxed iframe (where the action was then cancelled with no explanation).
   */
  const askConfirm = useCallback(
    (request: ConfirmRequest) => new Promise<boolean>((resolve) => {
      // Only one confirm can be on screen; a pending one is answered "no" first so its
      // caller unwinds instead of hanging.
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmRequest(request);
    }),
    [],
  );

  const settleConfirm = useCallback((confirmed: boolean) => {
    setConfirmRequest(null);
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    resolve?.(confirmed);
  }, []);

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
    // A request that resolves after unmount must not register a timer nobody will clear.
    if (!mountedRef.current) {
      return;
    }
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
    refreshGenerationRef.current += 1;
    const generation = refreshGenerationRef.current;

    try {
      const results = await Promise.allSettled(REFRESH_ENDPOINTS.map((e) => api<unknown>(e.path)));

      // A newer refresh started (or the screen went away) while these were in flight: its
      // data is the current truth, so writing ours on top would resurrect stale state.
      if (!mountedRef.current || generation !== refreshGenerationRef.current) {
        return;
      }

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
      setLoaded(true);

      if (nextDests) {
        const list = nextDests;
        setNewAlias((prev) => ({
          ...prev,
          dest: getDestSelectionState(list, prev.dest).selectedValue,
        }));
      }

      // A partial load used to live only in the 5s toast. Once it expired the user was
      // left with an apparently empty panel and no explanation, so it is kept on screen
      // with a retry until a refresh actually succeeds.
      setLoadFailures(failures);
      setStatus('');
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
        if (!cancelled) setProfile(value || { rootDomain: '', username: '' });
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
    if (!loaded) {
      // Before the first refresh lands there is nothing to be empty about; announcing
      // "No aliases created yet" and then replacing it with a list reads as a glitch.
      aliasListEmptyMessage = t('aliases.empty.loading');
    } else if (search) {
      aliasListEmptyMessage = t('aliases.empty.noResults');
    } else if (catchAll) {
      aliasListEmptyMessage = t('aliases.empty.onlyCatchAll');
    } else {
      // With no search active and no catch-all, an empty list means the panel has no
      // aliases at all — `rules.length` cannot be non-zero here, since filterAliasRules
      // only ever removes the catch-all.
      aliasListEmptyMessage = t('aliases.empty.none');
    }
  }

  const normalizedLocalPart = newAlias.local.trim().toLowerCase();
  const previewText = `${normalizedLocalPart || t('aliases.row.fallbackName')}@${profile.rootDomain || '…'}`;
  const droppingNewAlias = newAlias.dest === DROP_DEST_VALUE;
  const canCreateAlias = Boolean(
    normalizedLocalPart &&
      profile.rootDomain &&
      (droppingNewAlias || verifiedDests.some((dest) => dest.email === newAlias.dest)),
  );

  const activeCount = aliasRules.filter((rule) => rule.enabled).length;
  let catchAllLabel = '—';
  if (loaded && catchAll !== null) {
    catchAllLabel = catchAll.enabled ? t('catchAll.state.active') : t('catchAll.state.paused');
  }

  function clearErrors() {
    setErrors({ alias: null, dest: null });
  }

  /** Shorthand for the many `setStatus('Error: …')` call sites. */
  function setErrorStatus(err: unknown) {
    setStatus(t('dashboard.status.error', { message: translateApiError(i18n, err) }));
  }

  async function logout() {
    // No runExclusive: it would leave the key set while the screen unmounts. A plain guard
    // is enough to stop the second click from firing another POST.
    if (inFlightRef.current.has('logout')) {
      return;
    }
    inFlightRef.current.add('logout');
    try {
      await apiRequest('/api/logout', 'POST');
    } catch {
      // The cookie may still be live, but there is nothing the user can do about it from
      // here and the panel is about to be replaced by the login screen either way.
    }
    onUnauthorized();
  }

  /**
   * Runs `run` under the key `key`, ignoring the call if that operation is already in
   * flight. It replaces the repeated manual guards (double submit with Enter, two quick
   * clicks on delete that fired two DELETEs and a spurious error toast).
   */
  async function runExclusive(key: string, run: () => Promise<void>) {
    // The guard reads a ref, not `busy`: the state snapshot in this closure is only as
    // fresh as the last render, so two events fired before React re-rendered both saw an
    // empty set and both ran. `busy` still drives the UI; the ref is the actual lock.
    if (inFlightRef.current.has(key)) {
      return;
    }
    inFlightRef.current.add(key);
    addBusy(key);
    try {
      await run();
    } finally {
      inFlightRef.current.delete(key);
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
   *
   * @returns true when the patch landed (so the editor can collapse); false on cancel/error.
   */
  async function updateRule(rule: Rule, patch: RulePatch): Promise<boolean> {
    // Nothing changed (same destination re-picked, "keep" on a Worker rule). Report success
    // so the editor collapses: returning false left it open with no request, no toast and
    // no explanation, which read as a dead Save button.
    if (Object.keys(patch).length === 0) {
      return true;
    }

    const summary = describeRuleActions(rule);
    if (replacesForeignAction(summary, patch)) {
      const ok = await askConfirm({
        title: t('confirm.replaceAction.title'),
        message: t('rules.editor.confirmReplace'),
        destructive: true,
      });
      if (!ok) {
        return false;
      }
    }

    let ok = false;
    await runExclusive(`rule:${rule.id}`, async () => {
      try {
        await api(`/api/rules/${rule.id}`, 'PUT', patch);
        await refreshAll();
        setStatus(t(patch.action ? 'dashboard.status.destUpdated' : 'dashboard.status.aliasUpdated'));
        ok = true;
      } catch (err) {
        setErrorStatus(err);
      }
    });
    return ok;
  }

  async function updateCatchAll(patch: CatchAllPatch): Promise<boolean> {
    // Same as updateRule: an empty patch means "nothing to save", not "the save failed".
    if (Object.keys(patch).length === 0) {
      return true;
    }

    const summary = describeRuleActions(catchAll);
    if (replacesForeignAction(summary, patch)) {
      const ok = await askConfirm({
        title: t('confirm.replaceAction.title'),
        message: t('rules.editor.confirmReplace'),
        destructive: true,
      });
      if (!ok) {
        return false;
      }
    }
    // Pausing it is not a small change: mail to an address with no alias stops being
    // accepted at all, and nothing on screen would say so afterwards.
    if (patch.enabled === false) {
      const ok = await askConfirm({
        title: t('confirm.catchAllDisable.title'),
        message: t('catchAll.confirmDisable'),
        destructive: true,
      });
      if (!ok) {
        return false;
      }
    }

    let ok = false;
    await runExclusive('catch-all', async () => {
      try {
        await api('/api/rules/catch-all', 'PUT', patch);
        await refreshAll();
        setStatus(t('dashboard.status.catchAllUpdated'));
        ok = true;
      } catch (err) {
        setErrorStatus(err);
      }
    });
    return ok;
  }

  async function deleteRule(id: string) {
    if (inFlightRef.current.has(`rule:${id}`)) {
      return;
    }
    const ok = await askConfirm({
      title: t('confirm.deleteAlias.title'),
      message: t('dashboard.confirm.deleteAlias'),
      confirmLabel: t('confirm.delete'),
      destructive: true,
    });
    if (!ok) {
      return;
    }

    await runExclusive(`rule:${id}`, async () => {
      try {
        await api(`/api/rules/${id}`, 'DELETE');
        // Drops the row as soon as the DELETE is confirmed, so the list does not sit on a
        // rule that is already gone while refreshAll runs. Not optimistic — nothing to roll
        // back, because this only runs after the server said yes.
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
    if (inFlightRef.current.has(`dest:${id}`)) {
      return;
    }

    const dest = dests.find((entry) => entry.id === id);
    const aliasesInUse = dest
      ? findAliasesUsingDestination(i18n, rules, dest.email, catchAll)
      : [];

    if (aliasesInUse.length > 0) {
      // Not a question. The server refuses this outright (`dest.in_use`, and there is no
      // force flag), so offering a confirm button was a dead end: it fired a DELETE that
      // always came back 400 into a generic error toast.
      await askConfirm({
        title: t('confirm.deleteDestInUse.title'),
        message: t('dashboard.confirm.deleteDestInUse', { aliases: aliasesInUse.join(', ') }),
        informational: true,
      });
      return;
    }

    const ok = await askConfirm({
      title: t('confirm.deleteDest.title'),
      message: t('dashboard.confirm.deleteDest'),
      confirmLabel: t('confirm.delete'),
      destructive: true,
    });
    if (!ok) {
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
        loading={busy.has('refresh')}
        onRefresh={() => void refreshAll()}
        onOpenPassword={() => setAccountMode('password')}
        onOpenUsername={() => setAccountMode('username')}
        onLogout={() => void logout()}
      />
      {confirmRequest !== null && (
        <ConfirmDialog
          {...confirmRequest}
          onConfirm={() => settleConfirm(true)}
          onCancel={() => settleConfirm(false)}
        />
      )}
      {accountMode !== null && (
        <AccountDialog
          mode={accountMode}
          currentUsername={profile.username}
          onClose={() => setAccountMode(null)}
          onUnauthorized={() => {
            setAccountMode(null);
            onUnauthorized();
          }}
          onChanged={(kind) => {
            setAccountMode(null);
            setStatus(kind === 'username' ? t('account.username.done') : t('account.password.done'));
            if (kind === 'username') {
              void api<Profile>('/api/me')
                .then((value) => {
                  if (mountedRef.current) {
                    setProfile(value || { rootDomain: '', username: '' });
                  }
                })
                // The rename already landed; only the displayed copy is stale. Say so
                // instead of leaving the old name on screen with no explanation.
                .catch((err: unknown) => {
                  setStatus(t('dashboard.status.profileError', {
                    message: translateApiError(i18nRef.current, err),
                  }));
                });
            }
          }}
        />
      )}
      {/* pb-12 instead of pb-20: the footer now supplies the missing breathing room. */}
      <main className="fade-in mx-auto max-w-[1180px] px-6 pb-12 pt-[104px]">
        {loadFailures.length > 0 && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card bg-accent-dark/10 px-4 py-3"
          >
            <p className="m-0 min-w-0 font-mono text-xs text-accent-dark">
              {t('dashboard.status.partialLoad', { details: loadFailures.join(' · ') })}
            </p>
            <button
              type="button"
              className={pillButtonClass}
              disabled={busy.has('refresh')}
              onClick={() => void refreshAll()}
            >
              {t('app.retry')}
            </button>
          </div>
        )}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-cream/65">
              {t('dashboard.eyebrow')}
            </div>
            <h1 className="m-0 text-[34px] font-bold tracking-[-0.035em]">
              {profile.rootDomain || '…'}
            </h1>
          </div>
          {/* w-full on narrow viewports: intentional stack under the domain, not an
              accidental wrap fighting the H1. sm+ sits beside the title again. */}
          <div className="flex w-full gap-4 font-mono text-xs text-cream/65 sm:w-auto sm:gap-6">
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <span className="font-sans text-[22px] font-bold text-cream">{activeCount}</span>
              {t('dashboard.activeAliases')}
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              {/* uppercase, not a hardcoded 'ON': the label is translated, so its casing
                  has to come from CSS rather than from the string. */}
              <span className="font-sans text-[22px] font-bold uppercase text-accent">
                {catchAllLabel}
              </span>
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
              loaded={loaded}
              verifiedDests={verifiedDests}
              busy={busy.has('catch-all')}
              onToggle={() => void updateCatchAll({ enabled: !catchAll?.enabled })}
              onEdit={updateCatchAll}
            />
            <DestinationsCard
              dests={dests}
              loaded={loaded}
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
