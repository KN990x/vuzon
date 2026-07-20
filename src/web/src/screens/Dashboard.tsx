import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, UnauthorizedError } from '../lib/api';
import { copyTextToClipboard } from '../lib/clipboard';
import { getDestSelectionState } from '../lib/dest-selection';
import {
  generateRandomLocalPart,
  getSingleForwardDestination,
  interpretAddDestError,
  ruleMatchesCatchAllSlot,
} from '../lib/rules';
import { isVerifiedStatus } from '../lib/verification';
import type { Destination, FormErrors, Profile, Rule } from '../lib/types';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Toast } from '../components/Toast';
import { AliasesCard } from '../components/AliasesCard';
import { CatchAllCard } from '../components/CatchAllCard';
import { DestinationsCard } from '../components/DestinationsCard';

// /api/me is not listed here: email and rootDomain come from server environment
// variables and do not change during the session, so it is fetched once on mount.
const REFRESH_ENDPOINTS = [
  { path: '/api/rules', label: 'reglas' },
  { path: '/api/addresses', label: 'destinatarios' },
  { path: '/api/rules/catch-all', label: 'catch-all' },
] as const;

interface ListResponse<T> {
  result?: T;
}

export function Dashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
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

  const [statusMsg, setStatusMsg] = useState('');
  const [errors, setErrors] = useState<FormErrors>({ alias: '', dest: '' });
  const [copied, setCopied] = useState(false);

  const statusTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const refreshDepthRef = useRef(0);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

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

  /** Cualquier 401 devuelve al login por estado de cliente (caso de uso 14). */
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
    refreshDepthRef.current += 1;
    if (refreshDepthRef.current === 1) {
      addBusy('refresh');
    }

    try {
      const results = await Promise.allSettled(REFRESH_ENDPOINTS.map((e) => api<unknown>(e.path)));
      const failures: string[] = [];
      let nextDests: Destination[] | null = null;

      results.forEach((result, i) => {
        const { path, label } = REFRESH_ENDPOINTS[i];
        if (result.status !== 'fulfilled') {
          if (path === '/api/rules/catch-all') {
            setCatchAll(null);
          }
          const msg = (result.reason as Error | undefined)?.message || String(result.reason);
          failures.push(`${label}: ${msg}`);
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
        setStatus(`Carga parcial: ${failures.join(' · ')}`);
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
        if (!cancelled) setStatus(`perfil: ${(err as Error).message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [api, setStatus]);

  // Derived values (same criteria as the documented Alpine client).
  const verifiedDests = dests.filter((dest) => isVerifiedStatus(dest.verified));

  const validRules = rules.filter((rule) => rule.name && rule.name.trim() !== '');
  const withoutCatchAllDup = validRules.filter((rule) => !ruleMatchesCatchAllSlot(rule, catchAll));
  const filteredRules = search
    ? withoutCatchAllDup.filter((rule) => rule.name!.toLowerCase().includes(search.toLowerCase()))
    : withoutCatchAllDup;

  let aliasListEmptyMessage = '';
  if (filteredRules.length === 0) {
    if (search) {
      aliasListEmptyMessage = 'No se encontraron alias.';
    } else if (catchAll) {
      aliasListEmptyMessage = 'No hay alias personalizados; solo aplica el catch-all.';
    } else if (rules.length === 0) {
      aliasListEmptyMessage = 'No hay alias creados.';
    } else {
      aliasListEmptyMessage = 'No se encontraron alias.';
    }
  }

  const normalizedLocalPart = newAlias.local.trim().toLowerCase();
  const previewText = `${normalizedLocalPart || 'alias'}@${profile.rootDomain || '...'}`;
  const canCreateAlias = Boolean(
    normalizedLocalPart &&
      profile.rootDomain &&
      verifiedDests.some((dest) => dest.email === newAlias.dest),
  );

  const activeCount = withoutCatchAllDup.filter((rule) => rule.enabled).length;
  const catchAllLabel = catchAll === null ? '—' : catchAll.enabled ? 'ON' : 'OFF';

  function clearErrors() {
    setErrors({ alias: '', dest: '' });
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

      try {
        await api('/api/rules', 'POST', { localPart, destEmail: newAlias.dest });
        setStatus('Alias creado');
        setNewAlias((prev) => ({ ...prev, local: '' }));
        await refreshAll();
      } catch (err) {
        setErrors((prev) => ({ ...prev, alias: (err as Error).message }));
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
        setStatus('Añadido. Revisa tu correo para verificar.');
        setNewDestInput('');
        await refreshAll();
      } catch (err) {
        setErrors((prev) => ({ ...prev, dest: interpretAddDestError(err) }));
      }
    });
  }

  async function toggleRule(rule: Rule) {
    await runExclusive(`rule:${rule.id}`, async () => {
      try {
        const action = rule.enabled ? 'disable' : 'enable';
        await api(`/api/rules/${rule.id}/${action}`, 'POST');
        await refreshAll();
        setStatus('Alias actualizado');
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
    });
  }

  async function changeRuleDest(rule: Rule, destEmail: string) {
    if (!destEmail || destEmail === getSingleForwardDestination(rule)) {
      return;
    }

    await runExclusive(`rule:${rule.id}`, async () => {
      try {
        await api(`/api/rules/${rule.id}`, 'PUT', { destEmail });
        await refreshAll();
        setStatus('Destino actualizado');
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
    });
  }

  async function deleteRule(id: string) {
    if (busy.has(`rule:${id}`)) {
      return;
    }
    if (!window.confirm('¿Eliminar alias permanentemente?')) {
      return;
    }

    await runExclusive(`rule:${id}`, async () => {
      try {
        await api(`/api/rules/${id}`, 'DELETE');
        // Optimistic filtering for immediate visual feedback; refreshAll re-syncs the rest.
        setRules((prev) => prev.filter((rule) => rule.id !== id));
        setStatus('Alias eliminado');
        await refreshAll();
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
        await refreshAll();
      }
    });
  }

  async function deleteDest(id: string) {
    if (busy.has(`dest:${id}`)) {
      return;
    }
    if (!window.confirm('¿Eliminar destinatario? Si hay reglas usándolo, dejarán de funcionar.')) {
      return;
    }

    await runExclusive(`dest:${id}`, async () => {
      try {
        await api(`/api/addresses/${id}`, 'DELETE');
        setStatus('Destinatario eliminado');
        await refreshAll();
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
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

    const result = await copyTextToClipboard(previewText);
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
      setStatus('No se pudo copiar (¿Usas HTTPS?)');
    }
  }

  return (
    <div className="min-h-screen bg-ink font-sans text-cream">
      <Header
        domain={profile.rootDomain}
        loading={busy.has('refresh')}
        onRefresh={() => void refreshAll()}
        onLogout={() => void logout()}
      />
      {/* pb-12 en vez de pb-20: el aire que falta lo aporta ahora el pie. */}
      <main className="fade-in mx-auto max-w-[1180px] px-6 pb-12 pt-[104px]">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-cream/65">
              Panel de enrutamiento
            </div>
            <h1 className="m-0 text-[34px] font-bold tracking-[-0.035em]">
              {profile.rootDomain || '…'}
            </h1>
          </div>
          <div className="flex gap-6 font-mono text-xs text-cream/65">
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans text-[22px] font-bold text-cream">{activeCount}</span>
              alias activos
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-sans text-[22px] font-bold text-accent">{catchAllLabel}</span>
              catch-all
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <AliasesCard
              domain={profile.rootDomain}
              rules={filteredRules}
              totalCount={withoutCatchAllDup.length}
              emptyMessage={aliasListEmptyMessage}
              search={search}
              onSearchChange={setSearch}
              isRulePending={(id) => busy.has(`rule:${id}`)}
              onToggleRule={(rule) => void toggleRule(rule)}
              onChangeRuleDest={(rule, destEmail) => void changeRuleDest(rule, destEmail)}
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
              aliasError={errors.alias}
            />
          </div>
          <div className="flex w-full flex-none flex-col gap-6 lg:w-80">
            <CatchAllCard catchAll={catchAll} />
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
              error={errors.dest}
            />
          </div>
        </div>
      </main>
      <Footer />
      <Toast message={statusMsg} />
    </div>
  );
}
