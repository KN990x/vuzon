import { ApiError } from './api';
import type { Rule, RuleAction } from './types';

/** Regla catch-all de Email Routing (matcher type all, o mismo id que el slot dedicado). */
export function ruleMatchesCatchAllSlot(rule: Rule, catchAll: Rule | null): boolean {
  if (Array.isArray(rule.matchers) && rule.matchers.some((m) => m && m.type === 'all')) {
    return true;
  }
  if (catchAll?.id && rule.id === catchAll.id) {
    return true;
  }
  return false;
}

function formatActionDestination(action: RuleAction): string {
  if (!action || typeof action.type !== 'string') {
    return '';
  }

  const { type } = action;
  const raw = action.value;
  const parts = Array.isArray(raw)
    ? raw.map((v) => (v == null ? '' : String(v))).filter(Boolean)
    : raw != null && raw !== ''
      ? [String(raw)]
      : [];

  if (type === 'forward') {
    return parts.length > 0 ? parts.join(', ') : '';
  }
  if (type === 'worker') {
    return parts.length > 0 ? `Worker: ${parts.join(', ')}` : 'Email Worker';
  }
  if (type === 'drop') {
    return 'Descartar';
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

export function getRuleDest(rule: Rule | null | undefined): string {
  const actions = rule?.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return '';
  }
  const chunks = actions.map(formatActionDestination).filter(Boolean);
  return chunks.length > 0 ? chunks.join(' · ') : '';
}

/**
 * Destino de una regla que reenvía a UNA sola dirección, o null.
 *
 * Solo esas reglas pueden editarse desde el panel con un desplegable: si la regla
 * ejecuta un Worker, descarta el correo o reenvía a varias direcciones, sustituirla
 * por un `forward` simple destruiría configuración hecha fuera de vuzon.
 */
export function getSingleForwardDestination(rule: Rule | null | undefined): string | null {
  const actions = rule?.actions;
  if (!Array.isArray(actions) || actions.length !== 1) {
    return null;
  }

  const [action] = actions;
  if (!action || action.type !== 'forward') {
    return null;
  }

  const values = Array.isArray(action.value) ? action.value : [action.value];
  if (values.length !== 1) {
    return null;
  }

  const [value] = values;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const ALIAS_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Generación local, sin backend: 8 caracteres de [0-9a-z].
 * Usa crypto en vez de Math.random: un alias predecible anula el propósito del panel.
 * El módulo se descarta por rechazo para no sesgar hacia los primeros caracteres.
 */
export function generateRandomLocalPart(): string {
  const limit = 256 - (256 % ALIAS_CHARS.length);
  let result = '';

  while (result.length < 8) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte < limit) {
        result += ALIAS_CHARS.charAt(byte % ALIAS_CHARS.length);
        if (result.length === 8) {
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Los errores de Cloudflare llegan siempre con el mensaje genérico de
 * `api-route-error.js`, así que el único rate limit distinguible es el 429 del
 * limiter propio del panel, que sí conserva su status.
 */
export function interpretAddDestError(err: unknown): string {
  const rawMessage = String((err as Error)?.message || err || '').trim();

  if (err instanceof ApiError && err.status === 429) {
    return 'Límite de solicitudes alcanzado. Espera unos segundos.';
  }

  return `Error: ${rawMessage || 'Desconocido'}`;
}
