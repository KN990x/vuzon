import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, apiRequest } from '../lib/api';
import { buildAuthErrorMessage } from '../lib/login-error';
import { checkNewPassword } from '../lib/password-policy';
import type { PasswordIssue } from '../lib/password-policy';
import { useI18n } from '../i18n/context';
import { pillButtonClass, authFieldClass, VuzonMark } from '../components/primitives';
import { LanguageMenu } from '../components/LanguageMenu';

/**
 * First-install wizard. It is what the SPA shows when `GET /api/me` answers 401 with
 * `auth.setup_required`, i.e. while the server has no credentials on disk.
 *
 * `POST /api/setup` signs the user in on success, so there is no trip through the login
 * screen: `onSuccess` goes straight to the panel.
 */
interface SetupProps {
  onSuccess: () => void;
  /**
   * Someone else finished the setup while this form was open (409). The panel has
   * credentials now, so the right screen is the login one — re-checking the session is how
   * the SPA gets there.
   */
  onAlreadyConfigured: () => void;
}

export function Setup({ onSuccess, onAlreadyConfigured }: SetupProps) {
  const i18n = useI18n();
  const { t, tRaw } = i18n;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  // Like the login screen: the raw error is kept and translated at render, so the message
  // follows the language switcher instead of freezing in the locale that was active.
  const [error, setError] = useState<unknown>(null);
  const [policyIssue, setPolicyIssue] = useState<PasswordIssue | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError(null);

    // Answered locally: the server validates the same rules, but its KDF makes the round
    // trip slow enough to be worth skipping for a typo in the confirmation.
    const issue = checkNewPassword(password, passwordConfirm);
    setPolicyIssue(issue);
    if (issue) {
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/setup', 'POST', { username, password, passwordConfirm });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'setup.already_done') {
        onAlreadyConfigured();
        return;
      }
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  let errorMessage = '';
  if (policyIssue) {
    errorMessage = tRaw(`error.issue.${policyIssue}`) ?? '';
  } else if (error !== null) {
    errorMessage = buildAuthErrorMessage(i18n, error, 'setup.error.generic');
  }

  // `py-10` and not just `px-6` like the login screen: the wizard is taller, so on a short
  // screen the page scrolls instead of centring and the card must not touch the top edge.
  return (
    <main className="fade-in flex min-h-screen items-center justify-center bg-ink px-6 py-10 font-sans text-cream">
      <div className="glass relative w-full max-w-sm rounded-panel p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex items-center gap-2.5">
            <VuzonMark size={28} />
            <span className="text-xl font-bold tracking-[-0.045em]">vuzon</span>
          </span>
          <span className="ml-auto">
            <LanguageMenu />
          </span>
        </div>

        <h1 className="m-0 mb-2 text-[15px] font-semibold tracking-[-0.02em]">
          {t('setup.title')}
        </h1>
        <p className="m-0 mb-6 text-[12.5px] leading-relaxed text-cream/60">
          {t('setup.intro')}
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('setup.username')}
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className={authFieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('setup.password')}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={authFieldClass}
            />
            <span className="font-mono text-[11px] text-cream/45">{t('setup.passwordHint')}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('setup.passwordConfirm')}
            </span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className={authFieldClass}
            />
          </label>

          {errorMessage && (
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {errorMessage}
            </p>
          )}

          <button type="submit" className={`${pillButtonClass} mt-1 py-2.5`} disabled={submitting}>
            {submitting ? t('setup.submitting') : t('setup.submit')}
          </button>
        </form>

        <p className="m-0 mt-5 text-[11.5px] leading-relaxed text-cream/45">
          {t('setup.warning')}
        </p>
      </div>
    </main>
  );
}
