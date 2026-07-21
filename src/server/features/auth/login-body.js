import { z } from 'zod';

export const AUTH_FIELD_MAX = 256;

/**
 * Both fields are trimmed, here and in `setup-body.js`. The two must agree: a password
 * saved with a trailing space that login trims away would never be accepted again.
 */
// Slugs, not prose: see platform/http/format-zod-error.js.
export const loginBodySchema = z.object({
  username: z.string({
    required_error: 'username.required',
    invalid_type_error: 'username.invalid',
  }).trim().min(1, 'username.required').max(AUTH_FIELD_MAX, 'username.too_long'),
  // No minimum length on login: the policy applies when the password is CHOSEN
  // (setup-body.js). Enforcing it here would only tell an attacker how long it is not.
  password: z.string({
    required_error: 'password.required',
    invalid_type_error: 'password.invalid',
  }).trim().min(1, 'password.required').max(AUTH_FIELD_MAX, 'password.too_long'),
});
