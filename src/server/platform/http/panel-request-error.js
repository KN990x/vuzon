/**
 * Request error written BY THE PANEL, safe to show to the user verbatim.
 *
 * Deliberately distinct from `CloudflareApiError`: that one is always flattened into a
 * generic message because its text comes from Cloudflare and must not leak (AGENTS.md
 * invariant). This message is written by us, so it can travel intact to the client.
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
