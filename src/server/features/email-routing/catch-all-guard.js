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

export const CATCH_ALL_MUTATION_ERROR =
  'No se puede modificar ni eliminar la regla catch-all desde esta API.';
