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
export function useMenu({ initialFocus }: { initialFocus?: () => number } = {}) {
  const [open, setOpen] = useState(false);
  // 'last' when the menu was opened with ArrowUp, which by the ARIA pattern lands on the
  // final item rather than the first.
  const [openIntent, setOpenIntent] = useState<'first' | 'last'>('first');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef(initialFocus);
  useEffect(() => {
    initialFocusRef.current = initialFocus;
  }, [initialFocus]);

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

  // Focus an item as soon as the menu mounts. Harmless for pointer users: the ring is drawn
  // by :focus-visible, which does not match a mouse click.
  //
  // Which item is not always the first. ArrowUp opens onto the last one, and a caller with
  // a checked item (the language `menuitemradio` group) points at that instead — landing on
  // "English" when Spanish is active describes the menu wrongly to a screen reader.
  useEffect(() => {
    if (!open) {
      return;
    }
    const list = items();
    if (list.length === 0) {
      return;
    }
    const preferred = initialFocusRef.current?.() ?? -1;
    const index = openIntent === 'last'
      ? list.length - 1
      : (preferred >= 0 && preferred < list.length ? preferred : 0);
    list[index]?.focus();
  }, [open, openIntent, items]);

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

      // Tab closes the menu and parks focus on the trigger. `setOpen(false)` is async, so
      // without preventDefault the Tab default still runs while the items are mounted:
      // focus moves trigger → first menuitem, React then unmounts, and focus drops to
      // <body>. The next Tab (now on the trigger, menu gone) leaves the control as usual.
      if (event.key === 'Tab') {
        event.preventDefault();
        close();
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
    toggle: useCallback(() => {
      setOpenIntent('first');
      setOpen((prev) => !prev);
    }, []),
    /**
     * Trigger `onKeyDown`. `aria-haspopup="menu"` tells a screen-reader user that ArrowDown
     * opens the popup and ArrowUp opens it on the last item; the trigger only listened for
     * clicks, so neither did anything and the promise the markup made was not kept.
     *
     * Enter and Space are handled by the browser's native button activation, which fires
     * `click` → `toggle`. Intercepting them here would open and immediately close.
     */
    onTriggerKeyDown: useCallback((event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }
      // Otherwise the page scrolls behind the menu that just opened.
      event.preventDefault();
      setOpenIntent(event.key === 'ArrowUp' ? 'last' : 'first');
      setOpen(true);
    }, []),
    close,
    containerRef,
    triggerRef,
    menuRef,
  };
}
