import { z } from 'zod';

const LOGIN_FIELD_MAX = 256;

// Slugs, not prose: see platform/http/format-zod-error.js.
export const loginBodySchema = z.object({
  username: z.string({
    required_error: 'username.required',
    invalid_type_error: 'username.invalid',
  }).trim().min(1, 'username.required').max(LOGIN_FIELD_MAX, 'username.too_long'),
  password: z.string({
    required_error: 'password.required',
    invalid_type_error: 'password.invalid',
  }).trim().min(1, 'password.required').max(LOGIN_FIELD_MAX, 'password.too_long'),
});
