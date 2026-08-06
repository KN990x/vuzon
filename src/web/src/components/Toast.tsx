import { useEffect, useRef, useState } from 'react';

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
  // Clearing the message and starting the fade-out at the same moment animated an EMPTY
  // pill: the text vanished on the first frame while the container spent the rest of the
  // transition shrinking. The last non-empty message is held for the duration so the toast
  // fades out with its content still in it.
  const [rendered, setRendered] = useState(message);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (message) {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setRendered(message);
      return;
    }

    // Matches the `.toast` transition; a little longer costs nothing, and a live region
    // holding stale text while invisible is not announced.
    timerRef.current = window.setTimeout(() => setRendered(''), 300);
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message]);

  return (
    <div
      role="status"
      data-visible={message ? 'true' : 'false'}
      className="toast glass fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-48px)] rounded-full px-5 py-2.5 font-mono text-[12.5px] text-cream/90"
    >
      {rendered}
    </div>
  );
}
