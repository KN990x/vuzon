import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Open/close and keyboard behaviour for the header's `role="menu"` popups.
 *
 * Both menus declared `menuitem` / `menuitemradio` — which promises a screen-reader user
 * that arrow keys move between items — while implementing nothing but click-outside and
 * Escape. Focus never even entered the menu, so a keyboard user tabbed straight past it
 * into the rest of the header.
 *
 * The model implemented here is the WAI-ARIA menu one, minus the parts this UI has no use
 * for (no submenus, no type-ahead): arrows wrap, Home/End jump, Escape and Tab close, and
 * focus goes to the first item on open and back to the trigger on close.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const items = useCallback(
    () => Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    ).filter((item) => !item.hasAttribute('disabled')),
    [],
  );

  /** Closes and puts focus back where the user left it. */
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Focus the first item as soon as the menu mounts. Harmless for pointer users: the ring
  // is drawn by :focus-visible, which does not match a mouse click.
  useEffect(() => {
    if (open) {
      items()[0]?.focus();
    }
  }, [open, items]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Escape must not leave focus stranded on a node that is being unmounted.
        close();
        return;
      }

      // Tab moves on rather than cycling inside: this is a menu, not a dialog, so it does
      // not trap focus — it just gets out of the way.
      if (event.key === 'Tab') {
        setOpen(false);
        return;
      }

      const list = items();
      if (list.length === 0) {
        return;
      }
      const current = list.indexOf(document.activeElement as HTMLElement);

      let next = -1;
      if (event.key === 'ArrowDown') {
        next = current < 0 ? 0 : (current + 1) % list.length;
      } else if (event.key === 'ArrowUp') {
        next = current < 0 ? list.length - 1 : (current - 1 + list.length) % list.length;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = list.length - 1;
      }

      if (next >= 0) {
        // Otherwise ArrowDown/Home/End scroll the page behind the open menu.
        event.preventDefault();
        list[next]?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, items, close]);

  return {
    open,
    /** Trigger handler: opens and closes. */
    toggle: useCallback(() => setOpen((prev) => !prev), []),
    close,
    containerRef,
    triggerRef,
    menuRef,
  };
}
