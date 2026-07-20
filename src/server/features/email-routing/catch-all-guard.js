import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * @param {string} ruleId
 * @returns {boolean}
 */
export function isCatchAllRuleId(ruleId) {
  return ruleId === 'catch_all';
}

/**
 * @param {unknown} rule
 * @returns {boolean}
 */
export function isCatchAllRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  const { id, matchers } = /** @type {{ id?: unknown, matchers?: unknown }} */ (rule);
  if (id === 'catch_all') {
    return true;
  }

  return Array.isArray(matchers)
    && matchers.some((matcher) => matcher && typeof matcher === 'object' && matcher.type === 'all');
}

/** English fallback; the panel renders CATCH_ALL_MUTATION_CODE in the active language. */
export const CATCH_ALL_MUTATION_ERROR =
  'The catch-all rule cannot be modified or deleted from this API.';

export const CATCH_ALL_MUTATION_CODE = ERROR_CODES.RULES_CATCH_ALL_READONLY;
