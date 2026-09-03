import { useEffect, useState } from 'react';
import { apiRequest, UnauthorizedError } from './lib/api';
import { sessionAfterUnauthorized } from './lib/session';
import { useI18n } from './i18n/context';
import type { MessageKey } from './i18n/en';
import { pillButtonClass } from './components/primitives';
import { LanguageMenu } from './components/LanguageMenu';
import { Login } from './screens/Login';
import { Setup } from './screens/Setup';
import { Dashboard } from './screens/Dashboard';

type Session = 'checking' | 'setup' | 'anon' | 'authed' | 'error';

/**
 * Login is a state of the SPA: if GET /api/me answers 401 the login screen is shown;
 * if it answers 200, the panel. There are no server-side redirects.
 * A network failure or 5xx does NOT end the session: a retry is offered instead.
 *
 * The same 401 carries `auth.setup_required` while the server has no credentials yet, and
 * that is what selects the first-install wizard — no extra endpoint to ask "are you
 * configured?", just the call the panel already made.
 */
export default function App() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session>('checking');
  // One-shot message handed to the login screen. Losing the setup race used to drop the
  // user straight onto an unexplained login form: the wizard 409s, App re-checks, the
  // re-check answers a plain 401, and the reason they were moved never reached the screen.
  const [loginNotice, setLoginNotice] = useState<MessageKey | null>(null);

  useEffect(() => {
    if (session !== 'checking') {
      return;
    }

    let cancelled = false;
    apiRequest('/api/me')
      .then(() => {
        if (!cancelled) setSession('authed');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!(err instanceof UnauthorizedError)) {
          setSession('error');
          return;
        }
        setSession(sessionAfterUnauthorized(err.code));
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (session === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink font-mono text-cream/70">
        {/* `sr-only` heading: the screen is a single status line, but a page with no
            heading at all leaves a screen-reader user with nothing to orient by. */}
        <h1 className="sr-only">{t('app.loading')}</h1>
        <p role="status" className="m-0 text-[13px] uppercase tracking-[0.22em]">
          {t('app.loading')}
        </p>
      </main>
    );
  }

  if (session === 'error') {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-5 bg-ink px-6 font-sans text-cream">
        {/* Login and Setup both offer the switcher; this screen is where a user is most
            likely to be stuck, and it was the one place they could not change language. */}
        <div className="absolute right-5 top-5">
          <LanguageMenu />
        </div>
        <h1 className="sr-only">{t('app.sessionCheckFailed')}</h1>
        <p role="alert" className="m-0 text-center font-mono text-[13px] text-cream/70">
          {t('app.sessionCheckFailed')}
        </p>
        <button type="button" className={pillButtonClass} onClick={() => setSession('checking')}>
          {t('app.retry')}
        </button>
      </main>
    );
  }

  if (session === 'setup') {
    return (
      <Setup
        onSuccess={() => {
          setLoginNotice(null);
          setSession('authed');
        }}
        onAlreadyConfigured={() => {
          setLoginNotice('error.setup.already_done');
          setSession('checking');
        }}
      />
    );
  }

  if (session === 'anon') {
    return (
      <Login
        onSuccess={() => {
          setLoginNotice(null);
          setSession('authed');
        }}
        onSetupRequired={() => {
          setLoginNotice(null);
          setSession('setup');
        }}
        notice={loginNotice}
        onNoticeDismiss={() => setLoginNotice(null)}
      />
    );
  }

  return (
    <Dashboard
      onUnauthorized={(code) => {
        const next = sessionAfterUnauthorized(code);
        // The setup-race notice is one-shot. Leaving it set meant a later logout
        // remounted Login still explaining a claim that had already happened.
        if (next === 'anon') {
          setLoginNotice(null);
        }
        setSession(next);
      }}
    />
  );
}
