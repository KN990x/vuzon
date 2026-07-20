import { Activity, ArrowRight } from 'lucide-react';
import type { Rule } from '../lib/types';
import { getRuleDest } from '../lib/rules';
import { CardIcon, chipClass } from './primitives';

/**
 * Tarjeta del catch-all. SOLO LECTURA por contrato: el backend rechaza
 * enable/disable/delete sobre esta regla, así que aquí no hay controles.
 */
export function CatchAllCard({ catchAll }: { catchAll: Rule | null }) {
  const enabled = Boolean(catchAll?.enabled);
  const destText = getRuleDest(catchAll);

  return (
    <section className="glass relative rounded-panel p-5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CardIcon>
            <Activity size={14} />
          </CardIcon>
          <span className="text-[15px] font-bold tracking-[-0.01em]">Catch-all</span>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
            catchAll === null ? 'text-cream/60' : enabled ? 'text-positive' : 'text-cream/60'
          }`}
        >
          {catchAll === null ? 'no disponible' : enabled ? 'activo' : 'pausado'}
        </span>
      </div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-cream/60">
        Todo correo a una dirección sin alias se reenvía al destino por defecto. Esta regla se
        gestiona desde Cloudflare y aquí es de solo lectura.
      </p>
      <div className={`${chipClass} ${enabled ? 'text-cream/75' : 'text-cream/65'}`}>
        <ArrowRight size={13} className="flex-none" aria-hidden />
        <span className="min-w-0 truncate">
          {catchAll === null ? 'No se pudo cargar la regla catch-all' : destText || 'Sin acción configurada'}
        </span>
      </div>
    </section>
  );
}
