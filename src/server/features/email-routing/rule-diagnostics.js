import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { PanelRequestError } from '../../platform/http/panel-request-error.js';

/**
 * Diagnosis of why creating an alias failed.
 *
 * Cloudflare publishes no stable error-code table for Email Routing, and
 * `api-route-error.js` flattens its text into a generic message so nothing upstream
 * leaks. The result until now: the two mistakes users actually make ("the destination
 * is not verified", "that alias already exists") both arrived as the generic
 * `cloudflare.generic` message.
 *
 * Here the cause is deduced from state the panel already knows how to query, and we
 * write the resulting message ourselves. The AGENTS.md invariant still holds.
 */

/**
 * (Reduced) mirror of `isVerifiedStatus` in src/web/src/lib/verification.ts.
 * Cloudflare has returned this field as a boolean, a string and a timestamp depending
 * on the API version, so any of those shapes is accepted.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isVerifiedAddress(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    if (normalized === 'true' || normalized === 'verified' || normalized === 'active') {
      return true;
    }
    // Verification timestamp: its mere presence means the address is verified.
    return !Number.isNaN(Date.parse(value));
  }
  if (typeof value === 'object' && value !== null) {
    return value.status === 'verified' || value.verification_status === 'active';
  }
  return false;
}

/**
 * @param {unknown[]} addresses Result of /email/routing/addresses.
 * @param {string} email
 * @returns {{ exists: boolean, verified: boolean }}
 */
export function inspectDestination(addresses, email) {
  const list = Array.isArray(addresses) ? addresses : [];
  const target = email.trim().toLowerCase();
  const match = list.find(
    (address) => typeof address?.email === 'string' && address.email.trim().toLowerCase() === target,
  );

  return {
    exists: Boolean(match),
    verified: Boolean(match) && isVerifiedAddress(match.verified),
  };
}

/**
 * Is there already a rule matching exactly this address?
 * Cloudflare accepts duplicate patterns but only the first rule processes the mail, so
 * creating a duplicate leaves an alias that looks like it works and does not.
 * @param {unknown[]} rules Result of /email/routing/rules.
 * @param {string} aliasEmail
 * @returns {boolean}
 */
export function hasRuleForAlias(rules, aliasEmail) {
  const list = Array.isArray(rules) ? rules : [];
  const target = aliasEmail.trim().toLowerCase();

  return list.some((rule) => Array.isArray(rule?.matchers) && rule.matchers.some(
    (matcher) => matcher
      && matcher.type === 'literal'
      && matcher.field === 'to'
      && typeof matcher.value === 'string'
      && matcher.value.trim().toLowerCase() === target,
  ));
}

/**
 * @param {string} destEmail
 * @returns {PanelRequestError}
 */
export function unverifiedDestinationError(destEmail) {
  return new PanelRequestError(
    `The destination ${destEmail} is not verified in Cloudflare. `
      + 'Check its inbox and confirm the address before creating the alias.',
    { code: ERROR_CODES.DEST_UNVERIFIED, params: { email: destEmail } },
  );
}

/**
 * @param {string} aliasEmail
 * @returns {PanelRequestError}
 */
export function duplicateAliasError(aliasEmail) {
  return new PanelRequestError(
    `The alias ${aliasEmail} already exists.`,
    { code: ERROR_CODES.RULES_DUPLICATE_ALIAS, params: { alias: aliasEmail } },
  );
}

/**
 * @param {string} destEmail
 * @returns {PanelRequestError}
 */
export function unknownDestinationError(destEmail) {
  return new PanelRequestError(
    `${destEmail} is not in the account's destination list. Add it as a destination first.`,
    { code: ERROR_CODES.DEST_UNKNOWN, params: { email: destEmail } },
  );
}
