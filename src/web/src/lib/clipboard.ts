export interface CopyResult {
  copied: boolean;
  /** true when the fallback failed too and the error toast is warranted. */
  failed: boolean;
}

/**
 * Copy with a two-step fallback: Clipboard API → `execCommand('copy')`.
 * (The Clipboard API is unavailable outside HTTPS/localhost, which is the normal case for
 * a homelab panel reached over plain HTTP.)
 *
 * There used to be a third tier, `prompt()`. It is gone for the same reasons AGENTS.md
 * gives for banning `window.confirm`: its buttons render in the BROWSER's language rather
 * than the panel's, it blocks the main thread, and it is a silent no-op in a sandboxed
 * iframe — so the "fallback" did nothing precisely where it was supposed to help. The
 * caller already surfaces `failed: true` as the `dashboard.status.copyFailed` toast, which
 * is translated and cannot be suppressed by the browser.
 */
export async function copyTextToClipboard(text: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text);
    return { copied: true, failed: false };
  } catch {
    // Expected on plain HTTP; not worth a console.error on every copy in production.
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  // Read-only and parked off-screen. Without this the textarea rendered at its default
  // size at the end of <body> for a frame, and on iOS `select()` on a focusable editable
  // field scrolls and zooms the page.
  textArea.setAttribute('readonly', '');
  textArea.setAttribute('aria-hidden', 'true');
  textArea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(textArea);
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textArea);

  return { copied, failed: !copied };
}
