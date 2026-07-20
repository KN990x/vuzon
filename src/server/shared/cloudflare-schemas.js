import { z } from 'zod';

/** IDs de recursos Cloudflare (zonas, cuentas, reglas, direcciones en rutas). */
export const cloudflareResourceIdSchema = z.string()
  .min(1, 'Identificador inválido')
  .max(64, 'Identificador demasiado largo')
  .regex(/^[A-Za-z0-9_-]+$/, 'Identificador con caracteres no permitidos');

/**
 * Minimal shape of an Email Routing rule as Cloudflare returns it, with only the fields
 * the panel sends back in a PUT. `passthrough` keeps the rest untouched.
 * It exists so we never build an update payload from a broken response (a `null` or an
 * unexpected object used to blow up with a TypeError → opaque 500).
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
