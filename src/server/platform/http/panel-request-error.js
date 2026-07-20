/**
 * Error de petición redactado POR EL PANEL, apto para mostrar al usuario tal cual.
 *
 * Se distingue a propósito de `CloudflareApiError`: aquel se aplasta siempre a un
 * mensaje genérico porque su texto viene de Cloudflare y no debe filtrarse
 * (invariante de AGENTS.md). Este mensaje lo escribimos nosotros, así que puede
 * viajar íntegro al cliente.
 */
export class PanelRequestError extends Error {
  /**
   * @param {string} message Texto en español mostrado al usuario.
   * @param {{ status?: number }} [opts]
   */
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = 'PanelRequestError';
    this.status = status;
  }
}
