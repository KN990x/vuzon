import type { RuleActionSummary } from './rules';
import type { RuleEditorPatch } from './types';

/**
 * What the rule editor writes, derived from its draft state.
 *
 * Extracted from RuleEditor because this is the function that decides what reaches
 * Cloudflare, and `PUT /zones/.../rules/{id}` replaces `actions` wholesale. The invariant it
 * encodes is that **an omitted field is preserved**: a Worker or fan-out rule is renamed or
 * paused by sending no `action` at all, which is the only way the panel can touch a rule
 * whose action it cannot write itself.
 */

/** `keep` only exists for actions the panel cannot express (worker, fanout). */
export type ActionChoice = 'keep' | 'forward' | 'drop';

export interface RulePatchDraft {
  summary: RuleActionSummary;
  choice: ActionChoice;
  /** Address picked in the destination select (only meaningful when choice is 'forward'). */
  dest: string;
  /** Current free-form label, or undefined when the rule has no name field (catch-all). */
  name?: string | undefined;
  nameDraft: string;
}

/** The action currently configured, when it is a single forward the panel can compare against. */
export function currentForwardDestination(summary: RuleActionSummary): string | null {
  return summary.kind === 'forward' ? summary.destinations[0] : null;
}

/**
 * The initial radio choice for a rule.
 *
 * A Worker or fan-out action has no equivalent among the choices the panel can write, so
 * those rules open on "keep" and nothing is replaced unless the user says so.
 */
export function initialActionChoice(summary: RuleActionSummary): ActionChoice {
  if (summary.kind === 'worker' || summary.kind === 'fanout') {
    return 'keep';
  }
  return summary.kind === 'drop' ? 'drop' : 'forward';
}

/**
 * Builds the patch for a draft, omitting every field that did not change.
 *
 * An empty result means "nothing to save" — the caller closes the editor instead of firing a
 * request. Returning `{}` and letting the caller silently do nothing made the Save button
 * look dead whenever the user re-picked the same destination or pressed Save on a Worker
 * rule they had only inspected.
 */
export function buildRulePatch({
  summary,
  choice,
  dest,
  name,
  nameDraft,
}: RulePatchDraft): RuleEditorPatch {
  const patch: RuleEditorPatch = {};
  const currentDest = currentForwardDestination(summary);

  if (choice === 'drop' && summary.kind !== 'drop') {
    patch.action = { type: 'drop' };
  }
  if (choice === 'forward' && dest && dest !== currentDest) {
    patch.action = { type: 'forward', value: [dest] };
  }

  // `name` is undefined for the catch-all, which has no label to edit. Elsewhere the
  // trimmed draft is compared against the trimmed current value so that adding, changing
  // AND clearing a name all produce a patch — the old `nameDraft.trim() !== ''` guard made
  // clearing impossible, and the field appeared to ignore the deletion.
  if (name !== undefined) {
    const nextName = nameDraft.trim();
    if (nextName !== (name ?? '').trim()) {
      patch.name = nextName;
    }
  }

  return patch;
}

/** True when the patch would replace an action the panel did not create. */
export function replacesForeignAction(
  summary: RuleActionSummary,
  patch: RuleEditorPatch,
): boolean {
  return patch.action !== undefined
    && (summary.kind === 'worker' || summary.kind === 'fanout');
}
