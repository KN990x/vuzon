import { z } from 'zod';
import { cloudflareResourceIdSchema } from '../../shared/cloudflare-schemas.js';

export { cloudflareResourceIdSchema };

// Every issue `message` is a stable slug, not prose: the panel is bilingual and the
// wording the user reads is picked by the browser (platform/http/format-zod-error.js).

export const addressSchema = z.object({
  email: z.string().email('email.invalid'),
});

export const ruleSchema = z.object({
  // Must start and end alphanumeric, and `.` / `_` / `-` may not be consecutive:
  // ".", "..", "-alias", "alias.", "a..b" produce invalid addresses that Cloudflare
  // rejects with a generic, confusing error.
  localPart: z.string()
    .min(1, 'alias.empty')
    .max(64, 'alias.too_long')
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'alias.charset'),
  destEmail: z.string().email('dest_email.invalid'),
});

/** Update of an existing alias: only the destination may change. */
export const ruleUpdateSchema = z.object({
  destEmail: z.string().email('dest_email.invalid'),
});
