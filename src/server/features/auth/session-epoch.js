/**
 * Revocación de sesiones en memoria.
 *
 * La cookie `vuzon_session` es autocontenida (firmada, sin estado en servidor), así
 * que `POST /api/logout` solo puede borrarla del navegador: una copia hecha antes
 * seguiría siendo válida durante los 7 días de maxAge. Como el panel no puede
 * persistir nada (restricción de diseño: sin base de datos ni disco), guardamos una
 * marca de tiempo en memoria y descartamos las sesiones emitidas antes de ella.
 *
 * `revokedBefore` arranca en 0 a propósito: reiniciar el proceso NO cierra la sesión
 * del usuario (es lo que se espera de un panel homelab que se reinicia al actualizar).
 * Lo único que se pierde en un reinicio es una revocación previa, y el margen es el
 * mismo que ya se acepta con varias réplicas compartiendo SESSION_SECRET.
 */

let revokedBefore = 0;

/** Invalida todas las sesiones emitidas hasta este momento. */
export function revokeSessionsIssuedUntilNow(now = Date.now()) {
  revokedBefore = now;
}

/**
 * @param {unknown} issuedAt Marca `issuedAt` guardada en la sesión al hacer login.
 * @returns {boolean}
 */
export function isSessionIssuanceValid(issuedAt) {
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) {
    return false;
  }
  return issuedAt > revokedBefore;
}

/** Solo para tests: devuelve el estado al valor de arranque. */
export function resetSessionEpochForTests() {
  revokedBefore = 0;
}
