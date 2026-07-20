import { PanelRequestError } from '../../platform/http/panel-request-error.js';

/**
 * Diagnóstico de por qué falla la creación de un alias.
 *
 * Cloudflare no publica una tabla estable de códigos de error para Email Routing, y
 * `api-route-error.js` aplasta su texto a un mensaje genérico para no filtrar nada
 * upstream. Resultado hasta ahora: los dos fallos que de verdad comete el usuario
 * ("el destino no está verificado", "ese alias ya existe") llegaban como
 * "No se pudo completar la operación con Cloudflare".
 *
 * Aquí se deduce la causa a partir del estado que el panel ya sabe consultar, y el
 * mensaje resultante lo redactamos nosotros. El invariante de AGENTS.md se mantiene.
 */

/**
 * Espejo (reducido) de `isVerifiedStatus` en src/web/src/lib/verification.ts.
 * Cloudflare ha devuelto este campo como booleano, cadena y timestamp según la
 * versión de la API, así que se acepta cualquiera de esas formas.
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
    // Timestamp de verificación: su mera presencia indica dirección verificada.
    return !Number.isNaN(Date.parse(value));
  }
  if (typeof value === 'object' && value !== null) {
    return value.status === 'verified' || value.verification_status === 'active';
  }
  return false;
}

/**
 * @param {unknown[]} addresses Resultado de /email/routing/addresses.
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
 * ¿Ya hay una regla que capture exactamente esta dirección?
 * Cloudflare acepta patrones duplicados pero solo la primera regla procesa el correo,
 * así que crear un duplicado deja un alias que aparenta funcionar y no lo hace.
 * @param {unknown[]} rules Resultado de /email/routing/rules.
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
    `El destino ${destEmail} no está verificado en Cloudflare. `
      + 'Revisa su bandeja de entrada y confirma la dirección antes de crear el alias.',
  );
}

/**
 * @param {string} aliasEmail
 * @returns {PanelRequestError}
 */
export function duplicateAliasError(aliasEmail) {
  return new PanelRequestError(`El alias ${aliasEmail} ya existe.`);
}

/**
 * @param {string} destEmail
 * @returns {PanelRequestError}
 */
export function unknownDestinationError(destEmail) {
  return new PanelRequestError(
    `${destEmail} no está en la lista de destinos de la cuenta. Añádelo primero como destinatario.`,
  );
}
