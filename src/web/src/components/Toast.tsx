/**
 * Status toast (auto-cleared after ~5s by whoever sets the message).
 *
 * The node stays mounted at all times and visibility is driven by `data-visible` plus a
 * CSS transition (see `.toast` in index.css). Besides avoiding the framer-motion
 * dependency, keeping the `role="status"` region alive is the right thing for screen
 * readers: a live region must exist before its content changes for the change to be
 * announced.
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
