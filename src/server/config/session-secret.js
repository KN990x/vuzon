import crypto from 'crypto';

const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;

/**
 * Secreto para firmar la cookie de sesión.
 * Origen: SESSION_SECRET en el entorno.
 * En production es obligatorio (mín. 32 caracteres). En desarrollo, si falta,
 * se genera uno efímero (las sesiones dejan de ser válidas al reiniciar el proceso).
 *
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string}
 */
export function resolveSessionSecret({ env = process.env } = {}) {
  const raw = env.SESSION_SECRET;
  const sessionSecret = typeof raw === 'string' ? raw.trim() : '';

  if (sessionSecret) {
    if (
      env.NODE_ENV === 'production'
      && sessionSecret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH
    ) {
      throw new Error(
        `SESSION_SECRET debe tener al menos ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} caracteres `
          + 'cuando NODE_ENV=production (p. ej. openssl rand -hex 32).',
      );
    }
    return sessionSecret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET es obligatorio cuando NODE_ENV=production. '
        + 'Define un valor estable en .env (p. ej. openssl rand -hex 32).',
    );
  }

  console.warn(
    'SESSION_SECRET no está definido: se ha generado un secreto efímero. '
      + 'Las sesiones de login no sobreviven al reinicio. '
      + 'En despliegue define SESSION_SECRET (p. ej. openssl rand -hex 32 en .env).',
  );

  return crypto.randomBytes(32).toString('hex');
}
