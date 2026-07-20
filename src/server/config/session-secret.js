import crypto from 'crypto';

const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;

/**
 * Secret used to sign the session cookie.
 * Source: SESSION_SECRET in the environment.
 * Required in production (min. 32 characters). In development, when missing, an
 * ephemeral one is generated (sessions stop being valid when the process restarts).
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
        `SESSION_SECRET must be at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters `
          + 'when NODE_ENV=production (e.g. openssl rand -hex 32).',
      );
    }
    return sessionSecret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required when NODE_ENV=production. '
        + 'Set a stable value in .env (e.g. openssl rand -hex 32).',
    );
  }

  console.warn(
    'SESSION_SECRET is not set: an ephemeral secret has been generated. '
      + 'Login sessions will not survive a restart. '
      + 'For deployment, set SESSION_SECRET (e.g. openssl rand -hex 32 in .env).',
  );

  return crypto.randomBytes(32).toString('hex');
}
