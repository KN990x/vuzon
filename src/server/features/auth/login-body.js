import { z } from 'zod';

const LOGIN_FIELD_MAX = 256;

export const loginBodySchema = z.object({
  username: z.string({
    required_error: 'Usuario requerido',
    invalid_type_error: 'Usuario inválido',
  }).trim().min(1, 'Usuario requerido').max(LOGIN_FIELD_MAX, 'Usuario demasiado largo'),
  password: z.string({
    required_error: 'Contraseña requerida',
    invalid_type_error: 'Contraseña inválida',
  }).trim().min(1, 'Contraseña requerida').max(LOGIN_FIELD_MAX, 'Contraseña demasiado larga'),
});
