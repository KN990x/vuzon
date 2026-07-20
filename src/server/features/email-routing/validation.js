import { z } from 'zod';
import { cloudflareResourceIdSchema } from '../../shared/cloudflare-schemas.js';

export { cloudflareResourceIdSchema };

export const addressSchema = z.object({
  email: z.string().email('Formato de correo inválido'),
});

export const ruleSchema = z.object({
  // Debe empezar y acabar en alfanumérico: ".", "..", "-alias" o "alias." producen
  // direcciones inválidas que Cloudflare rechaza con un error genérico y confuso.
  localPart: z.string()
    .min(1, 'El alias no puede estar vacío')
    .max(64, 'El alias es demasiado largo')
    .regex(
      /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
      'Solo minúsculas, números, puntos y guiones; debe empezar y acabar en letra o número',
    ),
  destEmail: z.string().email('Email de destino inválido'),
});

/** Actualización de un alias existente: solo se permite cambiar el destino. */
export const ruleUpdateSchema = z.object({
  destEmail: z.string().email('Email de destino inválido'),
});
