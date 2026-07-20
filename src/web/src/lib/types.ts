export interface Profile {
  email?: string;
  rootDomain: string;
}

export interface Destination {
  id: string;
  email: string;
  /** Se reenvía tal cual desde Cloudflare: boolean, string, objeto, timestamp… */
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

export interface FormErrors {
  alias: string;
  dest: string;
}
