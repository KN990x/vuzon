import { ApiError } from './api';
import { translateApiError } from '../i18n/api-errors';
import type { MessageKey } from '../i18n/en';
import type { Translator } from '../i18n/locale';

/**
 * Auth failure → message in the active language.
 *
 * The two cases the API cannot describe get panel-written copy: a response that is not
 * JSON (an HTML 502 from a proxy in front of the panel) and a fetch that never reached
 * the server. Those are transport-level and read the same on every screen, so they share
 * the `auth.error.*` keys; only the "nothing else fits" sentence is per screen.
 * Everything else is a real API error and goes through the shared `code` → catalogue
 * translation.
 *
 * This used to be decided by regexing the Spanish error text, which broke on any
 * rewording; now it switches on the codes `api.ts` attaches.
 */
export function buildAuthErrorMessage(
  translator: Translator,
  err: unknown,
  genericKey: MessageKey,
): string {
  const { t } = translator;

  if (!(err instanceof Error)) {
    return t(genericKey);
  }

  if (err instanceof ApiError
    && (err.code === 'client.non_json' || err.code === 'client.invalid_json')) {
    return err.status >= 500
      ? t('auth.error.server')
      : t('auth.error.http', { status: err.status });
  }

  if (err instanceof TypeError) {
    return t('auth.error.network');
  }

  const { code, message } = err as Error & { code?: string };
  if (!code && !message) {
    return t(genericKey);
  }

  return translateApiError(translator, err);
}

/** Login screen: `POST /api/login` failed. */
export function buildLoginErrorMessage(translator: Translator, err: unknown): string {
  return buildAuthErrorMessage(translator, err, 'login.error.generic');
}
