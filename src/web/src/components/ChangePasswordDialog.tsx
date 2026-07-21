import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { buildAuthErrorMessage } from '../lib/login-error';
import { checkNewPassword } from '../lib/password-policy';
import type { PasswordIssue } from '../lib/password-policy';
import { useI18n } from '../i18n/context';
import { pillButtonClass } from './primitives';

const fieldClass =
  'rounded-[10px] bg-white/[0.04] px-3 py-2.5 font-mono text-[13px] text-cream ' +
  'placeholder:text-cream/45 transition-colors duration-200 focus:bg-white/[0.07]';

interface ChangePasswordDialogProps {
  onClose: () => void;
  /** Reported to the panel so the change lands in the shared status toast. */
  onChanged: () => void;
}

/**
 * Password change, the counterpart of the setup wizard: once the credentials live on the
 * server instead of in `.env`, this is the only way to change them without deleting the
 * file from the data volume.
 *
 * The overlay is hand-rolled — the panel ships no dialog library and no animation library
 * (see AGENTS.md); `.fade-in` in index.css is the whole transition budget.
 */
export function ChangePasswordDialog({ onClose, onChanged }: ChangePasswordDialogProps) {
  const i18n = useI18n();
  const { t, tRaw } = i18n;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [policyIssue, setPolicyIssue] = useState<PasswordIssue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError(null);
    const issue = checkNewPassword(newPassword, newPasswordConfirm);
    setPolicyIssue(issue);
    if (issue) {
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/account/password', 'POST', {
        currentPassword,
        newPassword,
        newPasswordConfirm,
      });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  let errorMessage = '';
  if (policyIssue) {
    errorMessage = tRaw(`error.issue.${policyIssue}`) ?? '';
  } else if (error !== null) {
    errorMessage = buildAuthErrorMessage(i18n, error, 'account.password.error.generic');
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 px-6"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes: dragging a
        // selection out of a field should not throw the form away.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('account.password.title')}
        className="fade-in glass w-full max-w-sm rounded-panel p-7"
      >
        <h2 className="m-0 mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-cream">
          {t('account.password.title')}
        </h2>
        <p className="m-0 mb-5 text-[12.5px] leading-relaxed text-cream/60">
          {t('account.password.notice')}
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('account.password.current')}
            </span>
            <input
              ref={firstFieldRef}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('account.password.new')}
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={fieldClass}
            />
            <span className="font-mono text-[11px] text-cream/45">{t('setup.passwordHint')}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('account.password.confirm')}
            </span>
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className={fieldClass}
            />
          </label>

          {errorMessage && (
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="mt-1 flex items-center gap-3">
            <button type="submit" className={pillButtonClass} disabled={submitting}>
              {submitting ? t('account.password.submitting') : t('account.password.submit')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer text-[12.5px] text-cream/65 transition-colors duration-200 hover:text-cream"
            >
              {t('account.password.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
