import { ApiError } from './api';
import { translateApiError } from '../i18n/api-errors';
import type { Translator } from '../i18n/locale';
import type { Rule, RuleAction } from './types';

/** Email Routing catch-all rule (matcher type all, or same id as the dedicated slot). */
export function ruleMatchesCatchAllSlot(rule: Rule, catchAll: Rule | null): boolean {
  if (Array.isArray(rule.matchers) && rule.matchers.some((m) => m && m.type === 'all')) {
    return true;
  }
  if (catchAll?.id && rule.id === catchAll.id) {
    return true;
  }
  return false;
}

function formatActionDestination({ t }: Translator, action: RuleAction): string {
  if (!action || typeof action.type !== 'string') {
    return '';
  }

  const { type } = action;
  const raw = action.value;
  const parts = Array.isArray(raw)
    ? raw.map((v) => (v == null ? '' : String(v))).filter(Boolean)
    : raw != null && raw !== ''
      ? [String(raw)]
      : [];

  if (type === 'forward') {
    return parts.length > 0 ? parts.join(', ') : '';
  }
  if (type === 'worker') {
    return parts.length > 0
      ? t('rule.action.worker', { value: parts.join(', ') })
      : t('rule.action.workerDefault');
  }
  if (type === 'drop') {
    return t('rule.action.drop');
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

/**
 * Human-readable destination of a rule. It takes the translator because a Worker or a
 * `drop` rule is described with words, not with an address.
 */
export function getRuleDest(translator: Translator, rule: Rule | null | undefined): string {
  const actions = rule?.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return '';
  }
  const chunks = actions.map((action) => formatActionDestination(translator, action))
    .filter(Boolean);
  return chunks.length > 0 ? chunks.join(' · ') : '';
}

/**
 * Destination of a rule that forwards to ONE single address, or null.
 *
 * Only those rules can be edited from the panel with a dropdown: if the rule runs a
 * Worker, drops the mail or forwards to several addresses, replacing it with a plain
 * `forward` would destroy configuration made outside vuzon.
 */
export function getSingleForwardDestination(rule: Rule | null | undefined): string | null {
  const actions = rule?.actions;
  if (!Array.isArray(actions) || actions.length !== 1) {
    return null;
  }

  const [action] = actions;
  if (!action || action.type !== 'forward') {
    return null;
  }

  const values = Array.isArray(action.value) ? action.value : [action.value];
  if (values.length !== 1) {
    return null;
  }

  const [value] = values;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const ALIAS_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Local generation, no backend: 8 characters from [0-9a-z].
 * Uses crypto instead of Math.random: a predictable alias defeats the panel's purpose.
 * The modulo is handled by rejection so the first characters are not favoured.
 */
export function generateRandomLocalPart(): string {
  const limit = 256 - (256 % ALIAS_CHARS.length);
  let result = '';

  while (result.length < 8) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte < limit) {
        result += ALIAS_CHARS.charAt(byte % ALIAS_CHARS.length);
        if (result.length === 8) {
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Cloudflare errors always arrive with the generic message from `api-route-error.js`,
 * so the only distinguishable rate limit is the 429 from the panel's own limiter, which
 * does keep its status (and now its own `rate_limit.*` code, translated like the rest).
 */
export function interpretAddDestError(translator: Translator, err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return translateApiError(translator, err);
  }

  return translator.t('dashboard.status.error', {
    message: translateApiError(translator, err),
  });
}
