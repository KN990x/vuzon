/**
 * Friendly messages for login failures that carry no server error: non-JSON responses
 * (e.g. an HTML 502 from a proxy) or network errors from the fetch.
 * JSON 400/401/429 arrive with the server's literal message and are shown verbatim.
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
