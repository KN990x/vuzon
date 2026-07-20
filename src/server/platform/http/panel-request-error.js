/**
 * Request error written BY THE PANEL, safe to show to the user verbatim.
 *
 * Deliberately distinct from `CloudflareApiError`: that one is always flattened into a
 * generic message because its text comes from Cloudflare and must not leak (AGENTS.md
 * invariant). This message is written by us, so it can travel intact to the client.
 *
 * The message is ENGLISH and only a fallback: what the user reads comes from `code` +
 * `params`, translated in the browser (see platform/http/error-codes.js).
 */
export class PanelRequestError extends Error {
  /**
   * @param {string} message English fallback text.
   * @param {{ status?: number, code?: string, params?: Record<string, unknown> }} [opts]
   */
  constructor(message, { status = 400, code = undefined, params = undefined } = {}) {
    super(message);
    this.name = 'PanelRequestError';
    this.status = status;
    this.code = code;
    this.params = params;
  }
}
