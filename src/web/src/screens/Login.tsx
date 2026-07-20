import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { buildLoginErrorMessage } from '../lib/login-error';
import { useI18n } from '../i18n/context';
import { pillButtonClass, VuzonMark } from '../components/primitives';
import { LanguageMenu } from '../components/LanguageMenu';

const fieldClass =
  'rounded-[10px] bg-white/[0.04] px-3 py-2.5 font-mono text-[13px] text-cream ' +
  'placeholder:text-cream/45 transition-colors duration-200 focus:bg-white/[0.07]';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // The raw error is kept, not its text: translating at render time means the message
  // follows the language switcher instead of freezing in whatever locale was active
  // when it failed.
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // 400 (Zod), 401 (credentials) and 429 (rate limit) arrive carrying the server's
      // error code, which buildLoginErrorMessage turns into localised copy.
      await apiRequest('/api/login', 'POST', { username, password });
      onSuccess();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const errorMessage = error === null ? '' : buildLoginErrorMessage(i18n, error);

  return (
    <main className="fade-in flex min-h-screen items-center justify-center bg-ink px-6 font-sans text-cream">
      <div className="glass relative w-full max-w-sm rounded-panel p-8">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="flex items-center gap-2.5">
            <VuzonMark size={28} />
            <span className="text-xl font-bold tracking-[-0.045em]">vuzon</span>
          </span>
          <span className="rounded-md bg-accent/10 px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {t('header.badge')}
          </span>
          {/* The switcher is on the login screen too: the language must be reachable
              before signing in, not only from the panel header. */}
          <span className="ml-auto">
            <LanguageMenu />
          </span>
        </div>
        <p className="m-0 mb-7 font-mono text-[11px] uppercase tracking-[0.22em] text-cream/65">
          {t('login.subtitle')}
        </p>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('login.username')}
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('login.password')}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={fieldClass}
            />
          </label>
          {errorMessage && (
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {errorMessage}
            </p>
          )}
          <button type="submit" className={`${pillButtonClass} mt-1 py-2.5`} disabled={submitting}>
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </main>
  );
}
