export interface Profile {
  rootDomain: string;
  username: string;
}

export interface Destination {
  id: string;
  email: string;
  /** Forwarded as-is from Cloudflare: boolean, string, object, timestamp… */
  verified: unknown;
}

export interface RuleMatcher {
  type?: string;
  field?: string;
  value?: string;
}

export interface RuleAction {
  type?: string;
  value?: unknown;
}

export interface Rule {
  id: string;
  name?: string;
  enabled?: boolean;
  matchers?: RuleMatcher[];
  actions?: RuleAction[];
}

/**
 * The actions the panel may WRITE (mirror of `panelActionSchema` on the server).
 *
 * `worker` is deliberately absent: vuzon shows and preserves Worker rules, but pointing
 * one at a script would need a Cloudflare scope the token does not carry. A Worker action
 * survives an edit because the request simply omits `action`.
 */
export type RuleActionInput =
  | { type: 'forward'; value: [string] }
  | { type: 'drop' };

/**
 * Patch sent to PUT /api/rules/:id — every field optional, omitted means "leave as is".
 * A type alias rather than an interface on purpose: only aliases get the implicit index
 * signature that lets them travel through the `Record<string, unknown>` body of `api()`.
 */
export type RulePatch = {
  action?: RuleActionInput;
  name?: string;
  enabled?: boolean;
};

/** Patch sent to PUT /api/rules/catch-all. The matcher is the server's business. */
export type CatchAllPatch = {
  action?: RuleActionInput;
  enabled?: boolean;
};

/** What the inline editor can produce; `enabled` has its own switch in the row. */
export type RuleEditorPatch = Pick<RulePatch, 'action' | 'name'>;

/**
 * Raw errors, not text: the message is produced at render time so it follows the
 * language switcher (see Dashboard.tsx).
 */
export interface FormErrors {
  alias: unknown;
  dest: unknown;
}
