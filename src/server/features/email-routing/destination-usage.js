import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { PanelRequestError } from '../../platform/http/panel-request-error.js';
import { actionValues } from './rule-actions.js';

/**
 * Does any action of this rule forward mail to `target` (already lowercased)?
 *
 * This walks `actions` directly instead of going through `describeRuleActions`: the usage
 * check must also see rules the panel cannot edit (several actions, an unknown type
 * alongside a forward). Refusing to delete a destination is a safety answer — it has to
 * err towards "still in use", never towards "I did not recognise the rule".
 * @param {unknown} rule
 * @param {string} target
 * @returns {boolean}
 */
function ruleForwardsTo(rule, target) {
  if (!rule || typeof rule !== 'object') {
    return false;
  }
  const { actions } = /** @type {{ actions?: unknown }} */ (rule);
  if (!Array.isArray(actions)) {
    return false;
  }

  return actions.some((action) => {
    if (!action || typeof action !== 'object' || action.type !== 'forward') {
      return false;
    }
    return actionValues(action.value).some((value) => value.toLowerCase() === target);
  });
}

/**
 * Human-readable label for a rule that references a destination (alias address,
 * or "catch-all"). Used in `params.aliases` — must be a plain string for i18n.
 * @param {unknown} rule
 * @returns {string}
 */
export function ruleAliasLabel(rule) {
  if (!rule || typeof rule !== 'object') {
    return 'unknown';
  }

  const { matchers, name, id } = /** @type {{
    matchers?: unknown,
    name?: unknown,
    id?: unknown,
  }} */ (rule);

  if (Array.isArray(matchers)) {
    for (const matcher of matchers) {
      if (!matcher || typeof matcher !== 'object') {
        continue;
      }
      if (matcher.type === 'all') {
        return 'catch-all';
      }
      if (
        matcher.type === 'literal'
        && matcher.field === 'to'
        && typeof matcher.value === 'string'
        && matcher.value.trim() !== ''
      ) {
        return matcher.value.trim();
      }
    }
  }

  if (typeof name === 'string' && name.trim() !== '') {
    return name.trim();
  }
  if (typeof id === 'string' && id.trim() !== '') {
    return id.trim();
  }
  return 'unknown';
}

/**
 * Rules whose forward actions include this destination email.
 * Mirror of `hasRuleForAlias` (rule-diagnostics.js): same trim/lowercase, same
 * scalar-or-array `actions[].value` handling as `isSingleForwardRule`.
 *
 * @param {unknown[]} rules Result of /email/routing/rules (plus catch-all if fetched).
 * @param {string} destEmail
 * @returns {unknown[]}
 */
export function findRulesUsingDestination(rules, destEmail) {
  const list = Array.isArray(rules) ? rules : [];
  const target = destEmail.trim().toLowerCase();
  if (!target) {
    return [];
  }

  return list.filter((rule) => ruleForwardsTo(rule, target));
}

/**
 * @param {string} destEmail
 * @param {string[]} aliasLabels
 * @returns {PanelRequestError}
 */
export function destinationInUseError(destEmail, aliasLabels) {
  const aliases = aliasLabels.join(', ');
  return new PanelRequestError(
    `Cannot delete ${destEmail}: it is still used by ${aliases}. `
      + 'Remove or re-point those rules first.',
    {
      code: ERROR_CODES.DEST_IN_USE,
      params: { email: destEmail, aliases },
    },
  );
}
