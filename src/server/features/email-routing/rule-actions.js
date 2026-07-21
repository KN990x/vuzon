import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * Classification of what an Email Routing rule actually does.
 *
 * Cloudflare offers exactly three action types (`forward`, `drop`, `worker`) and a rule
 * carries one of them. The panel needs to tell them apart for two different reasons:
 *
 *   - the UI renders a Worker or a `drop` rule differently from a plain forward;
 *   - `PUT /zones/.../rules/{id}` replaces `actions` WHOLESALE, so before rewriting one
 *     we must be sure we understood what was there.
 *
 * That second point used to be covered by refusing to edit anything that was not a
 * single forward. It is now covered by `isPanelEditableRule`: the panel writes only what
 * the user explicitly chose, and refuses any rule whose current action it cannot even
 * describe — an action type Cloudflare adds tomorrow is still never overwritten.
 *
 * `src/web/src/lib/rules.ts` mirrors this module for the browser.
 */

/**
 * `actions[].value` has been a string and an array of strings depending on the endpoint
 * and the API version, so both shapes are normalized here once. Blank entries are
 * dropped: Cloudflare has returned `value: [""]` for Workers with no explicit script.
 * @param {unknown} value
 * @returns {string[]}
 */
export function actionValues(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * @typedef {'forward' | 'drop' | 'worker' | 'fanout' | 'unknown'} RuleActionKind
 * @typedef {{
 *   kind: RuleActionKind,
 *   destinations: string[],
 *   workerName: string | null,
 * }} RuleActionSummary
 */

/** @type {RuleActionSummary} */
const UNKNOWN = Object.freeze({ kind: 'unknown', destinations: [], workerName: null });

/**
 * @param {unknown} rule
 * @returns {RuleActionSummary}
 */
export function describeRuleActions(rule) {
  if (!rule || typeof rule !== 'object') {
    return UNKNOWN;
  }

  const { actions } = /** @type {{ actions?: unknown }} */ (rule);
  // A rule with several actions is not something the panel can round-trip safely, and
  // Cloudflare's own editor never produces one.
  if (!Array.isArray(actions) || actions.length !== 1) {
    return UNKNOWN;
  }

  const [action] = actions;
  if (!action || typeof action !== 'object') {
    return UNKNOWN;
  }

  const values = actionValues(action.value);

  if (action.type === 'drop') {
    return { kind: 'drop', destinations: [], workerName: null };
  }

  if (action.type === 'worker') {
    // A Worker with no script name still IS a Worker rule: it renders as the generic
    // "Email Worker" label and stays editable for name/enabled.
    return { kind: 'worker', destinations: [], workerName: values[0] ?? null };
  }

  if (action.type === 'forward') {
    if (values.length === 0) {
      return UNKNOWN;
    }
    return {
      kind: values.length === 1 ? 'forward' : 'fanout',
      destinations: values,
      workerName: null,
    };
  }

  return UNKNOWN;
}

/**
 * May the panel rewrite this rule? Everything it can describe, it can also preserve
 * byte-for-byte, so the only refusal is an action it does not understand.
 * @param {unknown} rule
 * @returns {boolean}
 */
export function isPanelEditableRule(rule) {
  return describeRuleActions(rule).kind !== 'unknown';
}

/** English fallback; the panel renders NOT_EDITABLE_RULE_CODE in the active language. */
export const NOT_EDITABLE_RULE_ERROR =
  'This rule uses an action the panel does not understand, so it cannot be edited here.';

export const NOT_EDITABLE_RULE_CODE = ERROR_CODES.RULES_NOT_EDITABLE;
