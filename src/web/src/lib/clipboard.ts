export interface CopyResult {
  copied: boolean;
  /** true when the fallback failed too and the error toast is warranted. */
  failed: boolean;
}

/**
 * Copy with a fallback chain: Clipboard API → execCommand('copy') → manual prompt.
 * (The Clipboard API fails outside HTTPS/localhost.)
 *
 * `promptLabel` is passed in by the caller instead of being written here: this module
 * stays free of user-facing copy, which lives in the i18n catalogues.
 */
export async function copyTextToClipboard(text: string, promptLabel: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text);
    return { copied: true, failed: false };
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textArea);

  if (!copied) {
    try {
      prompt(promptLabel, text);
    } catch {
      // dialogs blocked (iframe/sandbox): the error toast already warns the user
    }
    return { copied: false, failed: true };
  }

  return { copied: true, failed: false };
}
