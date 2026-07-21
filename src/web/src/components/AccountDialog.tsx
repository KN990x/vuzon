import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { apiRequest, UnauthorizedError } from '../lib/api';
import { buildAuthErrorMessage } from '../lib/login-error';
import { checkNewPassword } from '../lib/password-policy';
import type { PasswordIssue } from '../lib/password-policy';
import { useI18n } from '../i18n/context';
import { pillButtonClass, authFieldClass } from './primitives';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type AccountChangeKind = 'username' | 'password';

interface AccountDialogProps {
  currentUsername: string;
  onClose: () => void;
  /** Session gone while the dialog was open — same path as any other 401 on the panel. */
  onUnauthorized: () => void;
  /** Reported to the panel so the change lands in the shared status toast. */
  onChanged: (kind: AccountChangeKind) => void;
}

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Account credentials dialog: rename the panel user and/or change the password. Both
 * forms verify the current password and revoke every other session on success.
 *
 * The overlay is hand-rolled — the panel ships no dialog library and no animation library
 * (see AGENTS.md); `.fade-in` in index.css is the whole transition budget.
 */
export function AccountDialog({
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

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Mark every sibling of the overlay inert so Tab and assistive tech stay inside the
    // dialog. The overlay is mounted as a sibling of <header> and <main> in Dashboard.
    const inerted: HTMLElement[] = [];
    const parent = overlayRef.current?.parentElement;
    if (parent) {
      for (const child of parent.children) {
        if (child !== overlayRef.current && child instanceof HTMLElement) {
          child.inert = true;
          inerted.push(child);
        }
      }
    }

    firstFieldRef.current?.focus();

    return () => {
      for (const el of inerted) {
        el.inert = false;
      }
      document.body.style.overflow = previousOverflow;
      // Escape / cancel must not leave focus stranded on a node that is being unmounted.
      previousActive?.focus();
    };
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

  function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) {
      return;
    }
    const focusable = listFocusable(dialogRef.current);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleAccountError(err: unknown, setError: (value: unknown) => void) {
    if (err instanceof UnauthorizedError) {
      onUnauthorizedRef.current();
      return;
    }
    setError(err);
  }

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernameSubmitting || passwordSubmitting) {
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
    if (passwordSubmitting || usernameSubmitting) {
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

  const busy = usernameSubmitting || passwordSubmitting;

  return (
    <div
      ref={overlayRef}
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('account.title')}
        className="fade-in glass glass-dialog relative w-full max-w-sm rounded-panel p-7"
        onKeyDown={trapTab}
      >
        <h2 className="m-0 mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-cream">
          {t('account.title')}
        </h2>
        <p className="m-0 mb-5 text-[12.5px] leading-relaxed text-cream/60">
          {t('account.notice')}
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleUsernameSubmit}>
          <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
            {t('account.username.title')}
          </h3>
          <p className="m-0 -mt-2 font-mono text-[11px] text-cream/45">
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
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {usernameErrorMessage}
            </p>
          )}

          <button type="submit" className={pillButtonClass} disabled={busy}>
            {usernameSubmitting ? t('account.username.submitting') : t('account.username.submit')}
          </button>
        </form>

        <div className="my-6 h-px bg-white/[0.08]" aria-hidden />

        <form className="flex flex-col gap-4" onSubmit={handlePasswordSubmit}>
          <h3 className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
            {t('account.password.title')}
          </h3>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              {t('account.password.current')}
            </span>
            <input
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
              className={authFieldClass}
            />
          </label>

          {passwordErrorMessage && (
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {passwordErrorMessage}
            </p>
          )}

          <div className="mt-1 flex items-center gap-3">
            <button type="submit" className={pillButtonClass} disabled={busy}>
              {passwordSubmitting ? t('account.password.submitting') : t('account.password.submit')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer text-[12.5px] text-cream/65 transition-colors duration-200 hover:text-cream"
            >
              {t('account.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
