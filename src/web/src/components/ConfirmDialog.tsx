import { useId, useRef } from 'react';
import type { RefObject } from 'react';
import { useDialog } from '../lib/use-dialog';
import { useI18n } from '../i18n/context';
import { pillButtonClass } from './primitives';

export interface ConfirmRequest {
  /** Heading. */
  title: string;
  /** Body copy, already translated. */
  message: string;
  /** Label of the confirming button. Omitted for an informational dialog. */
  confirmLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /**
   * Informational: the action cannot proceed and the dialog only explains why. Renders a
   * single dismiss button instead of a confirm/cancel pair.
   */
  informational?: boolean;
}

interface ConfirmDialogProps extends ConfirmRequest {
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Where focus goes when the element that opened the dialog is gone by the time it
   * closes — which is the normal outcome of confirming a delete.
   */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Confirmation modal.
 *
 * It replaces `window.confirm`, which rendered its OK/Cancel buttons in the BROWSER's
 * language rather than the panel's — so a Spanish user deleting an alias got a Spanish
 * question with English buttons. It also blocked the main thread and is a silent no-op in
 * a sandboxed iframe, which meant the confirm simply never appeared and the action was
 * cancelled with no explanation.
 *
 * `informational` exists for the one case that is not a question: deleting a destination
 * still in use is refused by the server (`dest.in_use`, with no force flag), so offering
 * "OK" was a dead end that always ended in an error toast.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  informational = false,
  onConfirm,
  onCancel,
  fallbackFocusRef,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const messageId = useId();
  // Focus starts on the safe choice: Cancel for a question, Dismiss for a notice. A
  // keyboard user pressing Enter on reflex must not delete anything.
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const { overlayRef, dialogRef, trapTab, onBackdropMouseDown } = useDialog({
    onClose: onCancel,
    initialFocusRef: safeButtonRef,
    fallbackFocusRef,
  });

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-ink/70"
    >
      {/* Outer scrolls; inner centres. Same-node flex+scroll clips the top on short viewports. */}
      <div
        className="flex min-h-full items-center justify-center px-6 py-10"
        onMouseDown={onBackdropMouseDown}
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          className="fade-in glass glass-dialog relative w-full max-w-sm rounded-panel p-7"
          onKeyDown={trapTab}
        >
          <h2
            id={titleId}
            className="m-0 mb-1.5 text-[15px] font-semibold tracking-[-0.02em] text-cream"
          >
            {title}
          </h2>
          <p id={messageId} className="m-0 mb-6 text-[12.5px] leading-relaxed text-cream/70">
            {message}
          </p>

          <div className="flex items-center justify-end gap-3">
            {informational ? (
              <button ref={safeButtonRef} type="button" className={pillButtonClass} onClick={onCancel}>
                {t('confirm.dismiss')}
              </button>
            ) : (
              <>
                <button
                  ref={safeButtonRef}
                  type="button"
                  onClick={onCancel}
                  className="cursor-pointer text-[12.5px] text-cream/65 transition-colors duration-200 hover:text-cream"
                >
                  {t('confirm.cancel')}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className={
                    destructive
                      ? 'cursor-pointer rounded-full bg-accent-dark/[0.12] px-4 py-[7px] text-[12.5px] '
                        + 'font-medium text-accent-dark shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] '
                        + 'transition-transform duration-200 hover:scale-105'
                      : pillButtonClass
                  }
                >
                  {confirmLabel ?? t('confirm.accept')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
