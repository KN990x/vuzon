import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { buildLoginErrorMessage } from '../lib/login-error';
import { pillButtonClass, VuzonMark } from '../components/primitives';

const fieldClass =
  'rounded-[10px] bg-white/[0.04] px-3 py-2.5 font-mono text-[13px] text-cream ' +
  'placeholder:text-cream/45 transition-colors duration-200 focus:bg-white/[0.07]';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      // 400 (Zod), 401 (credenciales) y 429 (rate limit) llegan como Error
      // con el mensaje literal del servidor y se muestran tal cual.
      await apiRequest('/api/login', 'POST', { username, password });
      onSuccess();
    } catch (err) {
      setError(buildLoginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="fade-in flex min-h-screen items-center justify-center bg-ink px-6 font-sans text-cream">
      <div className="glass relative w-full max-w-sm rounded-panel p-8">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="flex items-center gap-2.5">
            <VuzonMark size={28} />
            <span className="text-xl font-bold tracking-[-0.045em]">vuzon</span>
          </span>
          <span className="rounded-md bg-accent/10 px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Panel
          </span>
        </div>
        <p className="m-0 mb-7 font-mono text-[11px] uppercase tracking-[0.22em] text-cream/65">
          Panel de enrutamiento
        </p>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/65">
              Usuario
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
              Contraseña
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
          {error && (
            <p className="m-0 rounded-[10px] bg-accent-dark/10 px-3 py-2 font-mono text-xs text-accent-dark" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={`${pillButtonClass} mt-1 py-2.5`} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
