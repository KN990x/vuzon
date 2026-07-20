import { z } from 'zod';

/**
 * Cloudflare resource ids (zones, accounts, rules, addresses in paths).
 * The issue messages are slugs, not prose: see platform/http/format-zod-error.js.
 */
export const cloudflareResourceIdSchema = z.string()
  .min(1, 'id.empty')
  .max(64, 'id.too_long')
  .regex(/^[A-Za-z0-9_-]+$/, 'id.charset');

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
