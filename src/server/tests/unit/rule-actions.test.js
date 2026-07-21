import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionValues,
  describeRuleActions,
  isPanelEditableRule,
} from '../../features/email-routing/rule-actions.js';

function rule(actions) {
  return { id: 'r1', name: 'a@example.com', actions };
}

test('actionValues: accepts a scalar or an array and drops blanks', () => {
  assert.deepEqual(actionValues('a@example.com'), ['a@example.com']);
  assert.deepEqual(actionValues(['  a@example.com  ']), ['a@example.com']);
  assert.deepEqual(actionValues(['a@example.com', '', '  ', null, 7]), ['a@example.com']);
  assert.deepEqual(actionValues(undefined), []);
  assert.deepEqual(actionValues([]), []);
});

test('describeRuleActions: a single forward', () => {
  const summary = describeRuleActions(rule([{ type: 'forward', value: ['d@example.com'] }]));
  assert.deepEqual(summary, {
    kind: 'forward',
    destinations: ['d@example.com'],
    workerName: null,
  });
});

test('describeRuleActions: several destinations are a fan-out, not a forward', () => {
  const summary = describeRuleActions(
    rule([{ type: 'forward', value: ['a@example.com', 'b@example.com'] }]),
  );
  assert.equal(summary.kind, 'fanout');
  assert.deepEqual(summary.destinations, ['a@example.com', 'b@example.com']);
});

test('describeRuleActions: drop and worker', () => {
  assert.deepEqual(describeRuleActions(rule([{ type: 'drop' }])), {
    kind: 'drop',
    destinations: [],
    workerName: null,
  });

  const worker = describeRuleActions(rule([{ type: 'worker', value: ['my-worker'] }]));
  assert.equal(worker.kind, 'worker');
  assert.equal(worker.workerName, 'my-worker');

  // Cloudflare has returned a Worker action with no script name; it is still a Worker.
  const anonymous = describeRuleActions(rule([{ type: 'worker', value: [] }]));
  assert.equal(anonymous.kind, 'worker');
  assert.equal(anonymous.workerName, null);
});

test('describeRuleActions: anything the panel cannot describe is unknown', () => {
  const cases = [
    null,
    {},
    rule(undefined),
    rule([]),
    rule([{ type: 'forward', value: ['a@example.com'] }, { type: 'drop' }]),
    rule([{ type: 'forward', value: [] }]),
    rule([{ type: 'quarantine', value: ['x'] }]),
    rule([null]),
  ];

  for (const value of cases) {
    assert.equal(describeRuleActions(value).kind, 'unknown', JSON.stringify(value));
    assert.equal(isPanelEditableRule(value), false);
  }
});

test('isPanelEditableRule: everything describable can be round-tripped', () => {
  // The point of the guard: the panel rewrites `actions` wholesale, so it must be able to
  // put back exactly what it read. A Worker rule qualifies — its action is preserved.
  for (const actions of [
    [{ type: 'forward', value: ['d@example.com'] }],
    [{ type: 'forward', value: ['a@example.com', 'b@example.com'] }],
    [{ type: 'drop' }],
    [{ type: 'worker', value: ['my-worker'] }],
  ]) {
    assert.equal(isPanelEditableRule(rule(actions)), true, JSON.stringify(actions));
  }
});
