import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * Server-side mirror of `getSingleForwardDestination` (src/web/src/lib/rules.ts).
 *
 * Only a rule with exactly one `forward` action to exactly one address can have its
 * destination replaced: `PUT /api/rules/:id` overwrites `actions` wholesale, so applying
 * it to a rule that runs a Worker, drops the mail or fans out to several addresses would
 * silently destroy configuration made outside vuzon.
 *
 * The panel already hides the dropdown for those rules, but that is a UI decision and the
 * server cannot trust the client — the same reason the catch-all guard lives here too.
 *
 * @param {unknown} rule
 * @returns {boolean}
 */
export function isSingleForwardRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  const { actions } = /** @type {{ actions?: unknown }} */ (rule);
  if (!Array.isArray(actions) || actions.length !== 1) {
    return false;
  }

  const [action] = actions;
  if (!action || typeof action !== 'object' || action.type !== 'forward') {
    return false;
  }

  const values = Array.isArray(action.value) ? action.value : [action.value];
  if (values.length !== 1) {
    return false;
  }

  const [value] = values;
  return typeof value === 'string' && value.trim() !== '';
}

/** English fallback; the panel renders NOT_EDITABLE_RULE_CODE in the active language. */
export const NOT_EDITABLE_RULE_ERROR =
  'This rule does not forward to a single address and cannot be edited from the panel.';

export const NOT_EDITABLE_RULE_CODE = ERROR_CODES.RULES_NOT_EDITABLE;
