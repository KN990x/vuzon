import { ApiError } from './api';
import { translateApiError } from '../i18n/api-errors';
import type { Translator } from '../i18n/locale';
import type { Rule } from './types';

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

/**
 * `actions[].value` has been a string and an array of strings depending on the endpoint
 * and the API version, so both shapes are normalized here once.
 * Mirror of `actionValues` in src/server/features/email-routing/rule-actions.js.
 */
export function actionValues(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export type RuleActionKind = 'forward' | 'drop' | 'worker' | 'fanout' | 'unknown';

export interface RuleActionSummary {
  kind: RuleActionKind;
  destinations: string[];
  workerName: string | null;
}

const UNKNOWN_SUMMARY: RuleActionSummary = { kind: 'unknown', destinations: [], workerName: null };

/**
 * What does this rule actually do?
 *
 * Exact mirror of `describeRuleActions` in
 * src/server/features/email-routing/rule-actions.js — the panel decides what to render
 * from it, the server decides what it is allowed to rewrite. They must agree, or the UI
 * offers an edit the API then refuses.
 */
export function describeRuleActions(rule: Rule | null | undefined): RuleActionSummary {
  const actions = rule?.actions;
  if (!Array.isArray(actions) || actions.length !== 1) {
    return UNKNOWN_SUMMARY;
  }

  const [action] = actions;
  if (!action || typeof action !== 'object') {
    return UNKNOWN_SUMMARY;
  }

  const values = actionValues(action.value);

  if (action.type === 'drop') {
    return { kind: 'drop', destinations: [], workerName: null };
  }
  if (action.type === 'worker') {
    return { kind: 'worker', destinations: [], workerName: values[0] ?? null };
  }
  if (action.type === 'forward') {
    if (values.length === 0) {
      return UNKNOWN_SUMMARY;
    }
    return {
      kind: values.length === 1 ? 'forward' : 'fanout',
      destinations: values,
      workerName: null,
    };
  }

  return UNKNOWN_SUMMARY;
}

/** Everything the panel can describe, it can also put back unchanged. */
export function isPanelEditableRule(rule: Rule | null | undefined): boolean {
  return describeRuleActions(rule).kind !== 'unknown';
}

/**
 * Human-readable destination of a rule. It takes the translator because a Worker or a
 * `drop` rule is described with words, not with an address.
 */
export function getRuleDest(
  { t }: Translator,
  rule: Rule | null | undefined,
  summary: RuleActionSummary = describeRuleActions(rule),
): string {
  switch (summary.kind) {
    case 'forward':
    case 'fanout':
      return summary.destinations.join(', ');
    case 'drop':
      return t('rule.action.drop');
    case 'worker':
      return summary.workerName
        ? t('rule.action.worker', { value: summary.workerName })
        : t('rule.action.workerDefault');
    default:
      // An action the panel does not model still deserves to show *something*, so the
      // raw values are printed rather than an empty row.
      return (rule?.actions ?? []).flatMap((action) => actionValues(action?.value)).join(' · ');
  }
}

/**
 * Destination of a rule that forwards to ONE single address, or null — i.e. the rules
 * whose destination can be swapped straight from the list, with no editor.
 */
export function getSingleForwardDestination(rule: Rule | null | undefined): string | null {
  const summary = describeRuleActions(rule);
  return summary.kind === 'forward' ? summary.destinations[0] : null;
}

/**
 * Alias labels (or "catch-all") for rules that forward to this destination.
 * Used by the delete-destination confirm dialog so the user sees the block before the API.
 */
export function findAliasesUsingDestination(
  rules: Rule[],
  destEmail: string,
  catchAll: Rule | null = null,
): string[] {
  const target = destEmail.trim().toLowerCase();
  if (!target) {
    return [];
  }

  const list = catchAll ? [...rules, catchAll] : rules;
  const labels: string[] = [];

  for (const rule of list) {
    const actions = rule?.actions;
    if (!Array.isArray(actions)) {
      continue;
    }
    // Walks `actions` directly rather than through describeRuleActions: the warning must
    // also fire for rules the panel cannot edit. Erring towards "still in use" is the
    // safe direction — mirrors findRulesUsingDestination on the server.
    const usesDest = actions.some((action) => (
      action?.type === 'forward'
      && actionValues(action.value).some((value) => value.toLowerCase() === target)
    ));
    if (!usesDest) {
      continue;
    }

    const matchers = rule.matchers;
    let label = '';
    if (Array.isArray(matchers)) {
      for (const matcher of matchers) {
        if (matcher?.type === 'all') {
          label = 'catch-all';
          break;
        }
        if (
          matcher?.type === 'literal'
          && matcher.field === 'to'
          && typeof matcher.value === 'string'
          && matcher.value.trim() !== ''
        ) {
          label = matcher.value.trim();
          break;
        }
      }
    }
    if (!label) {
      label = (typeof rule.name === 'string' && rule.name.trim()) || rule.id || 'unknown';
    }
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }

  return labels;
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
