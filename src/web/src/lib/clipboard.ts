export interface CopyResult {
  copied: boolean;
  /** true when the fallback failed too and the error toast is warranted. */
  failed: boolean;
}

/**
 * Copia con fallback: Clipboard API → execCommand('copy') → prompt manual.
 * (La Clipboard API falla fuera de HTTPS/localhost.)
 */
export async function copyTextToClipboard(text: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text);
    return { copied: true, failed: false };
  } catch (err) {
    console.error('Error al copiar:', err);
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
      prompt('Copia tu alias manualmente:', text);
    } catch {
      // diálogos bloqueados (iframe/sandbox): el toast de error ya avisa
    }
    return { copied: false, failed: true };
  }

  return { copied: true, failed: false };
}
