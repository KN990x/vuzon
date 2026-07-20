/**
 * Toast de estado (auto-limpiado a los ~5s por quien fija el mensaje).
 *
 * El nodo se mantiene siempre montado y la visibilidad se controla con
 * `data-visible` + una transición CSS (ver `.toast` en index.css). Además de
 * evitar la dependencia de framer-motion, mantener viva la región `role="status"`
 * es lo correcto para lectores de pantalla: una live region debe existir antes de
 * que cambie su contenido para que el cambio se anuncie.
 */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-visible={message ? 'true' : 'false'}
      className="toast glass fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-48px)] rounded-full px-5 py-2.5 font-mono text-[12.5px] text-cream/90"
    >
      {message}
    </div>
  );
}
