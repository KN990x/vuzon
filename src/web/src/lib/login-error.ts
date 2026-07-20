import { ApiError } from './api';
import { translateApiError } from '../i18n/api-errors';
import type { Translator } from '../i18n/locale';

/**
 * Login failure → message in the active language.
 *
 * The two cases the API cannot describe get panel-written copy: a response that is not
 * JSON (an HTML 502 from a proxy in front of the panel) and a fetch that never reached
 * the server. Everything else is a real API error and goes through the shared
 * `code` → catalogue translation.
 *
 * This used to be decided by regexing the Spanish error text, which broke on any
 * rewording; now it switches on the codes `api.ts` attaches.
 */
export function buildLoginErrorMessage(translator: Translator, err: unknown): string {
  const { t } = translator;

  if (!(err instanceof Error)) {
    return t('login.error.generic');
  }

  if (err instanceof ApiError
    && (err.code === 'client.non_json' || err.code === 'client.invalid_json')) {
    return err.status >= 500
      ? t('login.error.server')
      : t('login.error.http', { status: err.status });
  }

  if (err instanceof TypeError) {
    return t('login.error.network');
  }

  const { code, message } = err as Error & { code?: string };
  if (!code && !message) {
    return t('login.error.generic');
  }

  return translateApiError(translator, err);
}
