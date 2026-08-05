import { useId } from 'react';
import { User } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useMenu } from '../lib/use-menu';
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
  const { open, toggle, close, containerRef, triggerRef, menuRef } = useMenu();
  const menuId = useId();

  function choose(action: () => void) {
    // `close` parks focus on the trigger before the dialog mounts, so AccountDialog's
    // "restore previousActive" lands back on this button when the dialog closes.
    close();
    action();
  }

  return (
    <div ref={containerRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        className={iconButtonClass}
        onClick={toggle}
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
          ref={menuRef}
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
