import { useCallback, useEffect, useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

interface UseDialogOptions {
  /** Escape and the backdrop route here. */
  onClose: () => void;
  /** Focused on mount. Falls back to the first focusable node in the dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Focused on unmount when the element focus came from no longer exists — the delete
   * case, where confirming removes the very row that owned the trigger.
   */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Modal plumbing shared by every dialog in the panel: body scroll lock, `inert` on the
 * overlay's siblings, initial focus, focus restoration on unmount, Escape, and a Tab trap.
 *
 * Extracted from AccountDialog when ConfirmDialog needed the same behaviour. The panel
 * ships no dialog library (see AGENTS.md), so this is the one implementation — duplicating
 * it was how the second dialog would have quietly ended up with a weaker version.
 */
export function useDialog({ onClose, initialFocusRef, fallbackFocusRef }: UseDialogOptions) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

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

    const initial = initialFocusRef?.current
      ?? (dialogRef.current ? listFocusable(dialogRef.current)[0] : null);
    initial?.focus();

    // Read now rather than in the cleanup: the fallback is a stable container (<main>),
    // it outlives the dialog either way, and reading a ref inside a cleanup is exactly the
    // pattern the hooks lint flags because the node it points at may already be gone.
    const fallback = fallbackFocusRef?.current ?? null;

    return () => {
      for (const el of inerted) {
        el.inert = false;
      }
      document.body.style.overflow = previousOverflow;
      // Escape / cancel must not leave focus stranded on a node that is being unmounted.
      //
      // `isConnected` guards the delete case: the element focus came FROM is usually the
      // row's trash button, and confirming the delete removes that row. Focusing a
      // detached node silently drops focus to <body>, so a keyboard user had to Tab from
      // the top of the document again after every deletion. The fallback keeps them in
      // the same region instead.
      if (previousActive?.isConnected) {
        previousActive.focus();
      } else {
        fallback?.focus();
      }
    };
  }, [initialFocusRef, fallbackFocusRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const trapTab = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) {
      return;
    }
    const focusable = listFocusable(dialogRef.current);
    if (focusable.length === 0) {
      return;
    }
    // `focusable.length === 0` was ruled out above, so both ends exist; the optional calls
    // are what lets the compiler agree without a non-null assertion.
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, []);

  /**
   * Backdrop handler. Only a press that both starts and ends on the backdrop closes:
   * dragging a selection out of a field should not throw the dialog away.
   */
  const onBackdropMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCloseRef.current();
    }
  }, []);

  return { overlayRef, dialogRef, trapTab, onBackdropMouseDown };
}
