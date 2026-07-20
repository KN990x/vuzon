import { Check, Clock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { Destination } from '../lib/types';
import { isVerifiedStatus } from '../lib/verification';
import { CardIcon, pillButtonClass } from './primitives';

const ROW_DIVIDER = 'shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]';

interface DestinationsCardProps {
  dests: Destination[];
  newDestInput: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  isDestPending: (id: string) => boolean;
  error: string;
}

export function DestinationsCard({
  dests, newDestInput, onInputChange, onAdd, onDelete, loading, isDestPending, error,
}: DestinationsCardProps) {
  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
        <CardIcon>
          <ShieldCheck size={14} />
        </CardIcon>
        <span className="text-[15px] font-bold tracking-[-0.01em]">Destinos verificados</span>
      </div>

      {dests.map((dest) => {
        const verified = isVerifiedStatus(dest.verified);
        const pending = isDestPending(dest.id);
        return (
          <div key={dest.id} className={`flex items-center gap-2.5 px-[18px] py-3 ${ROW_DIVIDER}`}>
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-cream/75">
              {dest.email}
            </span>
            {verified ? (
              <span className="flex flex-none items-center gap-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-positive">
                <Check size={12} aria-hidden />
                Verificada
              </span>
            ) : (
              <span className="flex flex-none items-center gap-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-cream/60">
                <Clock size={12} aria-hidden />
                Pendiente
              </span>
            )}
            <button
              type="button"
              onClick={() => onDelete(dest.id)}
              disabled={pending}
              title="Eliminar destinatario"
              aria-label={`Eliminar ${dest.email}`}
              className="flex-none text-cream/65 transition-colors duration-200 hover:text-accent-dark disabled:cursor-wait disabled:opacity-60 disabled:hover:text-cream/65 enabled:cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}

      {dests.length === 0 && (
        <div className={`px-[18px] py-3 font-mono text-xs text-cream/60 ${ROW_DIVIDER}`}>
          Sin destinos todavía.
        </div>
      )}

      <form
        className="px-[18px] py-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex text-cream/65" aria-hidden>
            <Plus size={15} />
          </span>
          <input
            type="email"
            value={newDestInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="tu@correo.com"
            aria-label="Nuevo destinatario"
            className="min-w-0 flex-1 font-mono text-[13px] text-cream placeholder:text-cream/45"
          />
          <button type="submit" className={pillButtonClass} disabled={!newDestInput || loading}>
            Añadir
          </button>
        </div>
        {error && <p className="m-0 mt-2 font-mono text-xs text-accent-dark">{error}</p>}
      </form>
    </section>
  );
}
