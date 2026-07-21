import { z } from 'zod';
import { AUTH_FIELD_MAX } from './login-body.js';

/**
 * Minimum length for a password the user is CHOOSING (setup wizard, password change).
 * The panel is reachable from a LAN or a tailnet and its login is rate limited, so this is
 * about stopping "1234", not about resisting an offline attack on a hash nobody can read.
 * Mirrored in `src/web/src/lib/password-policy.ts` (no import crosses the package boundary).
 */
export const MIN_PASSWORD_LENGTH = 12;

// Slugs, not prose: see platform/http/format-zod-error.js.
const usernameSchema = z.string({
  required_error: 'username.required',
  invalid_type_error: 'username.invalid',
}).trim().min(1, 'username.required').max(AUTH_FIELD_MAX, 'username.too_long');

/** Trimmed like `loginBodySchema`, so what is stored is what login later compares. */
const newPasswordSchema = z.string({
  required_error: 'password.required',
  invalid_type_error: 'password.invalid',
}).trim().min(MIN_PASSWORD_LENGTH, 'password.too_short').max(AUTH_FIELD_MAX, 'password.too_long');

const confirmationSchema = z.string({
  required_error: 'password.required',
  invalid_type_error: 'password.invalid',
}).trim();

/** First-install wizard: `POST /api/setup`. */
export const setupBodySchema = z.object({
  username: usernameSchema,
  password: newPasswordSchema,
  passwordConfirm: confirmationSchema,
}).refine((body) => body.password === body.passwordConfirm, {
  message: 'password.mismatch',
  path: ['passwordConfirm'],
});

/** Password change from the panel: `POST /api/account/password`. */
export const passwordChangeBodySchema = z.object({
  currentPassword: z.string({
    required_error: 'password.current_required',
    invalid_type_error: 'password.invalid',
  }).trim().min(1, 'password.current_required').max(AUTH_FIELD_MAX, 'password.too_long'),
  newPassword: newPasswordSchema,
  newPasswordConfirm: confirmationSchema,
}).refine((body) => body.newPassword === body.newPasswordConfirm, {
  message: 'password.mismatch',
  path: ['newPasswordConfirm'],
});
