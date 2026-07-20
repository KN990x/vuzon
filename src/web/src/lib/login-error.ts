/**
 * Mensajes amigables para fallos de login que no traen un error del servidor:
 * respuestas no-JSON (p. ej. 502 HTML de un proxy) o errores de red del fetch.
 * Los 400/401/429 JSON llegan con el mensaje literal del servidor y se muestran tal cual.
 */
export function buildLoginErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'No se pudo iniciar sesión';
  }

  const unexpectedResponse = err.message.match(
    /^Respuesta (?:inesperada|JSON inválida) del servidor \((\d+)\)$/,
  );
  if (unexpectedResponse) {
    const status = Number(unexpectedResponse[1]);
    return status >= 500
      ? 'Error del servidor. Inténtalo de nuevo.'
      : `No se pudo iniciar sesión (HTTP ${status})`;
  }

  if (err instanceof TypeError) {
    return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
  }

  return err.message || 'No se pudo iniciar sesión';
}
