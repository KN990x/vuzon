import { useEffect, useState } from 'react';
import { apiRequest, UnauthorizedError } from './lib/api';
import { pillButtonClass } from './components/primitives';
import { Login } from './screens/Login';
import { Dashboard } from './screens/Dashboard';

type Session = 'checking' | 'anon' | 'authed' | 'error';

/**
 * Login is a state of the SPA: if GET /api/me answers 401 the login screen is shown;
 * if it answers 200, the panel. There are no server-side redirects.
 * A network failure or 5xx does NOT end the session: a retry is offered instead.
 */
export default function App() {
  const [session, setSession] = useState<Session>('checking');

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
        setSession(err instanceof UnauthorizedError ? 'anon' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (session === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink font-mono text-cream/70">
        <p role="status" className="m-0 text-[13px] uppercase tracking-[0.22em]">
          Cargando…
        </p>
      </main>
    );
  }

  if (session === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink px-6 font-sans text-cream">
        <p role="alert" className="m-0 text-center font-mono text-[13px] text-cream/70">
          No se pudo comprobar la sesión. Revisa la conexión con el servidor.
        </p>
        <button type="button" className={pillButtonClass} onClick={() => setSession('checking')}>
          Reintentar
        </button>
      </main>
    );
  }

  if (session === 'anon') {
    return <Login onSuccess={() => setSession('authed')} />;
  }

  return <Dashboard onUnauthorized={() => setSession('anon')} />;
}
