import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest, UnauthorizedError } from '../lib/api';
import { buildAuthErrorMessage } from '../lib/login-error';
import { checkNewPassword } from '../lib/password-policy';
import type { PasswordIssue } from '../lib/password-policy';
import { useDialog } from '../lib/use-dialog';
import { useI18n } from '../i18n/context';
import { authFieldClass, formErrorClass, pillButtonClass } from './primitives';

export type AccountChangeKind = 'username' | 'password';

interface AccountDialogProps {
  mode: AccountChangeKind;
  currentUsername: string;
  onClose: () => void;
  /** Session gone while the dialog was open — same path as any other 401 on the panel. */
  onUnauthorized: () => void;
  /** Reported to the panel so the change lands in the shared status toast. */
  onChanged: (kind: AccountChangeKind) => void;
}

/**
 * Account credentials dialog: rename the panel user or change the password (one form
 * at a time). Both flows verify the current password and revoke every other session
 * on success.
 *
 * The overlay is hand-rolled — the panel ships no dialog library and no animation library
 * (see AGENTS.md); `.fade-in` in index.css is the whole transition budget.
 */
export function AccountDialog({
  mode,
  currentUsername,
  onClose,
  onUnauthorized,
  onChanged,
}: AccountDialogProps) {
  const i18n = useI18n();
  const { t, tRaw } = i18n;

  const [newUsername, setNewUsername] = useState(currentUsername);
  const [usernamePassword, setUsernamePassword] = useState('');
  const [usernameError, setUsernameError] = useState<unknown>(null);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<unknown>(null);
  const [policyIssue, setPolicyIssue] = useState<PasswordIssue | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  // Synced in an effect, not during render: a render React throws away must not leave a
  // mutated ref behind. Same rule as Dashboard.tsx and use-dialog.ts.
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  const titleKey = mode === 'username' ? 'account.username.title' : 'account.password.title';
  const titleId = useId();

  // Escape while a submit is in flight would unmount the dialog mid-request: the change
  // still lands server-side (other sessions really are revoked) but onChanged never fires,
  // so there is no toast and no profile refresh. The request owns the dialog until it ends.
  const submitting = usernameSubmitting || passwordSubmitting;
  // Every way out of this dialog goes through here — Escape, the backdrop AND the Cancel
  // button. Cancel used to call `onClose` directly, so it was the one exit that ignored
  // the rule above: clicking it mid-request closed the dialog while the change went on to
  // land, revoking every other session with no toast and no profile refresh to show for it.
  const requestClose = () => {
    if (!submitting) {
      onClose();
    }
  };
  const { overlayRef, dialogRef, trapTab, onBackdropMouseDown } = useDialog({
    onClose: requestClose,
    initialFocusRef: firstFieldRef,
  });

  function handleAccountError(err: unknown, setError: (value: unknown) => void) {
    if (err instanceof UnauthorizedError) {
      onUnauthorizedRef.current();
      return;
    }
    setError(err);
  }

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernameSubmitting) {
      return;
    }

    setUsernameError(null);
    setUsernameSubmitting(true);
    try {
      await apiRequest('/api/account/username', 'POST', {
        newUsername,
        currentPassword: usernamePassword,
      });
      onChanged('username');
    } catch (err) {
      handleAccountError(err, setUsernameError);
    } finally {
      setUsernameSubmitting(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSubmitting) {
      return;
    }

    setPasswordError(null);
    const issue = checkNewPassword(newPassword, newPasswordConfirm);
    setPolicyIssue(issue);
    if (issue) {
      return;
    }

    setPasswordSubmitting(true);
    try {
      await apiRequest('/api/account/password', 'POST', {
        currentPassword,
        newPassword,
        newPasswordConfirm,
      });
      onChanged('password');
    } catch (err) {
      handleAccountError(err, setPasswordError);
    } finally {
      setPasswordSubmitting(false);
    }
  }

  let usernameErrorMessage = '';
  if (usernameError !== null) {
    usernameErrorMessage = buildAuthErrorMessage(i18n, usernameError, 'account.username.error.generic');
  }

  let passwordErrorMessage = '';
  if (policyIssue) {
    passwordErrorMessage = tRaw(`error.issue.${policyIssue}`) ?? '';
  } else if (passwordError !== null) {
    passwordErrorMessage = buildAuthErrorMessage(i18n, passwordError, 'account.password.error.generic');
  }

  const cancelButton = (
    <button
      type="button"
      onClick={requestClose}
      disabled={submitting}
      className="cursor-pointer text-[12.5px] text-cream/65 transition-colors duration-200 hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
    >
      {t('account.cancel')}
    </button>
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-ink/70"
    >
      {/* Outer scrolls; inner centres. Same-node flex+scroll clips the top on short viewports. */}
      <div
        className="flex min-h-full items-center justify-center px-6 py-10"
        onMouseDown={onBackdropMouseDown}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          // Points at the heading rather than repeating it in an aria-label: the two could
          // drift, and ConfirmDialog already names itself this way.
          aria-labelledby={titleId}
          className="fade-in glass glass-dialog relative w-full max-w-sm rounded-panel p-7"
          onKeyDown={trapTab}
        >
          <h2 id={titleId} className="m-0 mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-cream">
            {t(titleKey)}
          </h2>
          <p className="m-0 mb-5 text-[12.5px] leading-relaxed text-cream/60">
            {t('account.notice')}
          </p>

          {mode === 'username' ? (
            <form className="flex flex-col gap-4" onSubmit={handleUsernameSubmit}>
              <p className="m-0 font-mono text-[11px] text-cream/60">
                {t('account.username.current', { username: currentUsername })}
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
                  {t('account.username.new')}
                </span>
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className={authFieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
                  {t('account.username.currentPassword')}
                </span>
                <input
                  type="password"
                  value={usernamePassword}
                  onChange={(e) => setUsernamePassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={authFieldClass}
                />
              </label>

              {usernameErrorMessage && (
                <p className={formErrorClass} role="alert">
                  {usernameErrorMessage}
                </p>
              )}

              <div className="mt-1 flex items-center gap-3">
                <button type="submit" className={pillButtonClass} disabled={usernameSubmitting}>
                  {usernameSubmitting ? t('account.username.submitting') : t('account.username.submit')}
                </button>
                {cancelButton}
              </div>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handlePasswordSubmit}>
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
                  className={authFieldClass}
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
                  className={authFieldClass}
                />
                <span className="font-mono text-[11px] text-cream/60">{t('setup.passwordHint')}</span>
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
                  className={authFieldClass}
                />
              </label>

              {passwordErrorMessage && (
                <p className={formErrorClass} role="alert">
                  {passwordErrorMessage}
                </p>
              )}

              <div className="mt-1 flex items-center gap-3">
                <button type="submit" className={pillButtonClass} disabled={passwordSubmitting}>
                  {passwordSubmitting ? t('account.password.submitting') : t('account.password.submit')}
                </button>
                {cancelButton}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
