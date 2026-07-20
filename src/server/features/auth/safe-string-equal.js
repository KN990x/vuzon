import crypto from 'node:crypto';

/**
 * Comparación en tiempo constante de dos strings UTF-8 (p. ej. credenciales en env).
 * Evita comparación con !== que acorta en el primer byte distinto.
 */
export function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len, 0);
  const padB = Buffer.alloc(len, 0);
  bufA.copy(padA);
  bufB.copy(padB);

  try {
    return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
  } catch {
    return false;
  }
}
