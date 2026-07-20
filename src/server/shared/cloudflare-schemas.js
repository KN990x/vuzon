import { z } from 'zod';

/** IDs de recursos Cloudflare (zonas, cuentas, reglas, direcciones en rutas). */
export const cloudflareResourceIdSchema = z.string()
  .min(1, 'Identificador inválido')
  .max(64, 'Identificador demasiado largo')
  .regex(/^[A-Za-z0-9_-]+$/, 'Identificador con caracteres no permitidos');

/**
 * Forma mínima de una regla de Email Routing tal como la devuelve Cloudflare, con solo
 * los campos que el panel reenvía en un PUT. `passthrough` conserva el resto sin tocarlo.
 * Sirve para no construir un payload de actualización a partir de una respuesta rota
 * (un `null` o un objeto inesperado reventaba con un TypeError → 500 opaco).
 */
export const cloudflareRuleSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  matchers: z.array(z.object({}).passthrough()).optional(),
  actions: z.array(z.object({}).passthrough()).optional(),
  priority: z.number().optional(),
  source: z.string().optional(),
  owner_worker_tag: z.string().optional(),
}).passthrough();
