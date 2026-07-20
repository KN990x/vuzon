export interface Profile {
  rootDomain: string;
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
 * Raw errors, not text: the message is produced at render time so it follows the
 * language switcher (see Dashboard.tsx).
 */
export interface FormErrors {
  alias: unknown;
  dest: unknown;
}
