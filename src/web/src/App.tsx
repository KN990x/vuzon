import { useEffect, useState } from 'react';
import { apiRequest, UnauthorizedError } from './lib/api';
import { pillButtonClass } from './components/primitives';
import { Login } from './screens/Login';
import { Dashboard } from './screens/Dashboard';

type Session = 'checking' | 'anon' | 'authed' | 'error';

/**
 * El login es un estado de la SPA: si GET /api/me responde 401 se muestra la
 * pantalla de login; si responde 200, el panel. No hay redirects de servidor.
 * Un fallo de red o 5xx NO cierra la sesión: se ofrece reintentar.
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
