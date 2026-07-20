import type { MessageParams, Translator } from './locale';

/**
 * Server error → text in the active language.
 *
 * The API answers `{ error, code, params? }` (src/server/platform/http/error-codes.js):
 * `error` is an English fallback and `code` is what we render from. Anything this
 * catalogue does not know falls back to that English text, so a code added on the server
 * degrades to readable prose instead of a blank line.
 */
export interface ApiErrorLike {
  message?: string;
  code?: string;
  params?: Record<string, unknown>;
}

interface ValidationIssue {
  field?: unknown;
  code?: unknown;
}

/** Only primitives can be interpolated; anything else is dropped. */
function toMessageParams(params: Record<string, unknown> | undefined): MessageParams {
  const result: MessageParams = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * `validation.invalid` carries one slug per offending field. They are translated one by
 * one and joined the same way the server joins its English fallback.
 */
function translateValidationIssues(
  { tRaw }: Translator,
  issues: ValidationIssue[],
): string | null {
  const parts = issues.map((issue) => {
    const field = typeof issue.field === 'string' ? issue.field : '';
    const code = typeof issue.code === 'string' ? issue.code : '';
    const text = (code && tRaw(`error.issue.${code}`)) || code;
    if (!text) {
      return '';
    }
    const label = field ? tRaw(`error.field.${field}`) ?? field : '';
    return label ? `${label}: ${text}` : text;
  }).filter(Boolean);

  return parts.length > 0 ? parts.join('. ') : null;
}

export function translateApiError(translator: Translator, err: unknown): string {
  const { t, tRaw } = translator;
  const { message, code, params } = (err ?? {}) as ApiErrorLike;

  if (code === 'validation.invalid') {
    const issues = params?.issues;
    const translated = Array.isArray(issues)
      ? translateValidationIssues(translator, issues as ValidationIssue[])
      : null;
    if (translated) {
      return translated;
    }
  }

  if (code) {
    const translated = tRaw(`error.${code}`, toMessageParams(params));
    if (translated) {
      return translated;
    }
  }

  return message || t('error.unknown');
}
