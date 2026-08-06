import { z } from 'zod';
import { cloudflareResourceIdSchema } from '../../shared/cloudflare-schemas.js';

export { cloudflareResourceIdSchema };

// Every issue `message` is a stable slug, not prose: the panel is bilingual and the
// wording the user reads is picked by the browser (platform/http/format-zod-error.js).
//
// That includes the ones zod raises on its own. A schema declared as a bare `z.string()`
// answers a missing or mistyped field with zod's built-in English ("Required", "Expected
// string, received number"), which no catalogue can translate — a Spanish user saw zod
// internals. `required_error` / `invalid_type_error` put those two back under the slug
// contract; `validation.test.js` asserts every emitted code still looks like a slug.

export const addressSchema = z.object({
  email: z.string({
    required_error: 'email.invalid',
    invalid_type_error: 'email.invalid',
  }).trim().email('email.invalid'),
});

/**
 * The actions the panel is allowed to WRITE.
 *
 * Cloudflare also has `worker`, and vuzon shows and preserves those rules — but it never
 * builds one: pointing a rule at a Worker would need the script list, and that means a
 * `Workers Scripts: Read` scope this token deliberately does not have (see AGENTS.md).
 * A Worker action survives an edit because the route keeps the rule's current `actions`
 * whenever the request omits `action`.
 *
 * `forward` takes exactly one address. Fan-out rules created elsewhere keep working and
 * stay editable for name/enabled, but the panel does not manufacture new ones: Cloudflare
 * maps one pattern to one destination and points at a Worker for anything else.
 */
export const panelActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('forward'),
    value: z.array(z.string({
      required_error: 'dest_email.invalid',
      invalid_type_error: 'dest_email.invalid',
    }).trim().email('dest_email.invalid'), {
      required_error: 'action.forward_single',
      invalid_type_error: 'action.forward_single',
    })
      .length(1, 'action.forward_single'),
  }),
  z.object({
    type: z.literal('drop'),
  }),
], { errorMap: () => ({ message: 'action.type' }) });

/**
 * Cloudflare's `name` is a free-text label; the panel only bounds it.
 *
 * The empty string is accepted on purpose: it is the state Cloudflare itself leaves on
 * rules created from its own panel, so it must be reachable from here too. Rejecting it
 * made the label add-only — clearing the field produced no patch and the editor looked
 * broken. `undefined` still means "preserve whatever is there"; `''` means "remove it".
 */
export const ruleNameSchema = z.string({
  required_error: 'rule_name.invalid',
  invalid_type_error: 'rule_name.invalid',
})
  .trim()
  .max(255, 'rule_name.too_long');

export const ruleSchema = z.object({
  // Must start and end alphanumeric, and `.` / `_` / `-` may not be consecutive:
  // ".", "..", "-alias", "alias.", "a..b" produce invalid addresses that Cloudflare
  // rejects with a generic, confusing error.
  localPart: z.string({
    required_error: 'alias.empty',
    invalid_type_error: 'alias.charset',
  })
    .min(1, 'alias.empty')
    .max(64, 'alias.too_long')
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'alias.charset'),
  action: panelActionSchema,
});

/**
 * Patch of an existing alias. Every field is optional and an omitted one is PRESERVED
 * from the rule Cloudflare currently holds — that is what lets a Worker rule be renamed
 * or paused without the panel ever writing a `worker` action itself.
 */
export const ruleUpdateSchema = z.object({
  action: panelActionSchema.optional(),
  name: ruleNameSchema.optional(),
  enabled: z.boolean({ invalid_type_error: 'enabled.invalid' }).optional(),
}).refine(
  (body) => body.action !== undefined || body.name !== undefined || body.enabled !== undefined,
  'rule_update.empty',
);

/**
 * Patch of the catch-all. Same preserve-on-omit rule, minus `name`: the fallback rule has
 * no alias to label and Cloudflare keeps its own. `matchers` is never accepted from the
 * client — the route forces `[{ type: 'all' }]`, which is the only shape Cloudflare takes.
 */
export const catchAllUpdateSchema = z.object({
  action: panelActionSchema.optional(),
  enabled: z.boolean({ invalid_type_error: 'enabled.invalid' }).optional(),
}).refine(
  (body) => body.action !== undefined || body.enabled !== undefined,
  'rule_update.empty',
);
