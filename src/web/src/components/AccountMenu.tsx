import { useEffect, useId, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { iconButtonClass } from './primitives';

interface AccountMenuProps {
  onOpenPassword: () => void;
  onOpenUsername: () => void;
  onLogout: () => void;
}

const menuItemClass =
  'flex w-full cursor-pointer items-center px-3.5 py-2 text-left text-[13px] '
  + 'text-cream/75 transition-colors duration-200 hover:bg-white/[0.06] hover:text-cream';

/**
 * Account control in the header: one user button, three actions (password, username,
 * sign out). Same open/close mechanics as LanguageMenu — click outside and Escape.
 */
export function AccountMenu({ onOpenPassword, onOpenUsername, onLogout }: AccountMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

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
        setOpen(false);
        // Escape must not leave focus stranded on a node that is being unmounted.
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    // Park focus on the trigger before the dialog mounts so AccountDialog's
    // "restore previousActive" lands back on this button when the dialog closes.
    triggerRef.current?.focus();
    action();
  }

  return (
    <div ref={containerRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        className={iconButtonClass}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t('header.account')}
        aria-label={t('header.account')}
      >
        <User size={17} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('header.account')}
          className="glass glass-menu fade-in absolute right-0 top-11 z-50 min-w-44 overflow-hidden rounded-panel py-1"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => choose(onOpenPassword)}
          >
            {t('account.password.title')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => choose(onOpenUsername)}
          >
            {t('account.username.title')}
          </button>
          <div className="my-1 h-px bg-white/[0.08]" aria-hidden />
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => choose(onLogout)}
          >
            {t('header.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
