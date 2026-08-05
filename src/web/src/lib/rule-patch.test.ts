import { expect, test } from 'vitest';
import {
  buildRulePatch,
  currentForwardDestination,
  initialActionChoice,
  replacesForeignAction,
} from './rule-patch';
import type { RuleActionSummary } from './rules';

const forward = (...destinations: string[]): RuleActionSummary => ({
  kind: 'forward',
  destinations,
  workerName: null,
});
const drop: RuleActionSummary = { kind: 'drop', destinations: [], workerName: null };
const worker: RuleActionSummary = { kind: 'worker', destinations: [], workerName: 'my-script' };
const fanout: RuleActionSummary = {
  kind: 'fanout',
  destinations: ['a@x.com', 'b@x.com'],
  workerName: null,
};
const unknown: RuleActionSummary = { kind: 'unknown', destinations: [], workerName: null };

test('initialActionChoice: only worker and fanout open on "keep"', () => {
  expect(initialActionChoice(worker)).toBe('keep');
  expect(initialActionChoice(fanout)).toBe('keep');
  expect(initialActionChoice(drop)).toBe('drop');
  expect(initialActionChoice(forward('a@x.com'))).toBe('forward');
  expect(initialActionChoice(unknown)).toBe('forward');
});

test('currentForwardDestination: only a single forward has one', () => {
  expect(currentForwardDestination(forward('a@x.com'))).toBe('a@x.com');
  expect(currentForwardDestination(drop)).toBeNull();
  expect(currentForwardDestination(worker)).toBeNull();
  expect(currentForwardDestination(fanout)).toBeNull();
});

test('re-picking the same destination produces no patch', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'a@x.com',
    name: 'label',
    nameDraft: 'label',
  })).toEqual({});
});

test('a different destination produces a forward action', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'b@x.com',
    name: 'label',
    nameDraft: 'label',
  })).toEqual({ action: { type: 'forward', value: ['b@x.com'] } });
});

test('a rule that already drops the mail produces no action patch', () => {
  expect(buildRulePatch({
    summary: drop,
    choice: 'drop',
    dest: '',
    name: '',
    nameDraft: '',
  })).toEqual({});
});

test('switching a forward to drop produces a drop action', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'drop',
    dest: 'a@x.com',
    name: '',
    nameDraft: '',
  })).toEqual({ action: { type: 'drop' } });
});

// This is the invariant that lets the panel touch rules it cannot write: PUT replaces
// `actions` wholesale, and an omitted `action` is preserved server-side.
test('"keep" never writes an action, so a Worker rule can be renamed untouched', () => {
  expect(buildRulePatch({
    summary: worker,
    choice: 'keep',
    dest: '',
    name: 'old',
    nameDraft: 'new',
  })).toEqual({ name: 'new' });

  expect(buildRulePatch({
    summary: fanout,
    choice: 'keep',
    dest: 'a@x.com',
    name: 'old',
    nameDraft: 'old',
  })).toEqual({});
});

test('the name is trimmed and compared against the trimmed current value', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'a@x.com',
    name: 'label',
    nameDraft: '  label  ',
  })).toEqual({});

  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'a@x.com',
    name: 'label',
    nameDraft: '  other  ',
  })).toEqual({ name: 'other' });
});

// Regression: the old guard was `nameDraft.trim() !== ''`, so emptying the field produced
// no patch at all. The label was add-only and the deletion silently did nothing.
test('clearing the name produces an empty-string patch, not a no-op', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'a@x.com',
    name: 'label',
    nameDraft: '   ',
  })).toEqual({ name: '' });
});

test('a rule with no name field (the catch-all) never gets a name patch', () => {
  expect(buildRulePatch({
    summary: forward('a@x.com'),
    choice: 'forward',
    dest: 'b@x.com',
    name: undefined,
    nameDraft: 'ignored',
  })).toEqual({ action: { type: 'forward', value: ['b@x.com'] } });
});

test('an empty destination never produces a forward action', () => {
  expect(buildRulePatch({
    summary: drop,
    choice: 'forward',
    dest: '',
    name: '',
    nameDraft: '',
  })).toEqual({});
});

test('replacesForeignAction fires only when an action would overwrite worker or fanout', () => {
  const action = { type: 'drop' } as const;
  expect(replacesForeignAction(worker, { action })).toBe(true);
  expect(replacesForeignAction(fanout, { action })).toBe(true);
  expect(replacesForeignAction(worker, { name: 'x' })).toBe(false);
  expect(replacesForeignAction(forward('a@x.com'), { action })).toBe(false);
  expect(replacesForeignAction(drop, { action })).toBe(false);
});
