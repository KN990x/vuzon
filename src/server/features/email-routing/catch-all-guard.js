import { ERROR_CODES } from '../../platform/http/error-codes.js';

/**
 * The catch-all reaches Cloudflare ONLY through `PUT /api/rules/catch-all`, never through
 * the generic `/api/rules/:id` routes. That endpoint is not a convenience: it forces
 * `matchers: [{ type: 'all' }]` (the single shape Cloudflare accepts for this slot) and
 * offers no DELETE, so the fallback rule cannot be reshaped or removed by accident.
 *
 * `catch-all` is listed alongside Cloudflare's own `catch_all` slug because
 * `cloudflareResourceIdSchema` accepts hyphens: if the dedicated route were ever
 * registered after `/api/rules/:id`, the panel's own URL would fall through to here.
 * This turns that mistake into a clear 400 instead of a confusing upstream 404.
 * @param {string} ruleId
 * @returns {boolean}
 */
export function isCatchAllRuleId(ruleId) {
  return ruleId === 'catch_all' || ruleId === 'catch-all';
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
