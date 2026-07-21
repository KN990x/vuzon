import { expect, test, vi } from 'vitest';
import { ApiError } from './api';
import {
  describeRuleActions,
  filterAliasRules,
  findAliasesUsingDestination,
  generateRandomLocalPart,
  getRuleAlias,
  getRuleDest,
  getSingleForwardDestination,
  interpretAddDestError,
  isPanelEditableRule,
  ruleMatchesCatchAllSlot,
} from './rules';
import { createTranslator } from '../i18n/locale';
import type { Rule } from './types';

// Worker/drop descriptions and error text are localised, so these helpers take a
// translator. English is asserted here; the Spanish wording is covered by the catalogue
// parity test.
const en = createTranslator('en');
const es = createTranslator('es');

test('getSingleForwardDestination: a forward to a single address is editable', () => {
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: ['a@x.com'] }] }),
  ).toBe('a@x.com');
  // Cloudflare has also returned the destination as a bare string.
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: 'a@x.com' }] }),
  ).toBe('a@x.com');
});

test('getSingleForwardDestination: anything that is not a plain forward has no quick swap', () => {
  // These are still editable — from the inline editor, which spells out what is replaced.
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'worker', value: ['w'] }] }),
  ).toBeNull();
  expect(getSingleForwardDestination({ id: 'r', actions: [{ type: 'drop' }] })).toBeNull();
  expect(
    getSingleForwardDestination({
      id: 'r',
      actions: [{ type: 'forward', value: ['a@x.com', 'b@x.com'] }],
    }),
  ).toBeNull();
  expect(
    getSingleForwardDestination({
      id: 'r',
      actions: [{ type: 'forward', value: ['a@x.com'] }, { type: 'drop' }],
    }),
  ).toBeNull();
});

test('getSingleForwardDestination: empty or invalid input returns null', () => {
  expect(getSingleForwardDestination(null)).toBeNull();
  expect(getSingleForwardDestination(undefined)).toBeNull();
  expect(getSingleForwardDestination({ id: 'r' })).toBeNull();
  expect(getSingleForwardDestination({ id: 'r', actions: [] })).toBeNull();
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: ['  '] }] }),
  ).toBeNull();
});

test('findAliasesUsingDestination: lists alias labels and catch-all', () => {
  const rules: Rule[] = [
    {
      id: 'r1',
      matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
      actions: [{ type: 'forward', value: 'Dest@Example.com' }],
    },
    {
      id: 'r2',
      matchers: [{ type: 'literal', field: 'to', value: 'b@example.com' }],
      actions: [{ type: 'forward', value: ['other@example.com'] }],
    },
  ];
  const catchAll: Rule = {
    id: 'catch_all_rule',
    matchers: [{ type: 'all' }],
    actions: [{ type: 'forward', value: ['dest@example.com'] }],
  };

  expect(findAliasesUsingDestination(rules, 'dest@example.com', catchAll)).toEqual([
    'a@example.com',
    'catch-all',
  ]);
  expect(findAliasesUsingDestination(rules, 'nobody@example.com', catchAll)).toEqual([]);
});

test('findAliasesUsingDestination: falls back to unknown when nothing identifies the rule', () => {
  expect(
    findAliasesUsingDestination(
      [{ id: '', actions: [{ type: 'forward', value: ['d@example.com'] }] }],
      'd@example.com',
    ),
  ).toEqual(['unknown']);
});

test('getRuleAlias: matcher wins over name', () => {
  expect(
    getRuleAlias({
      id: 'r',
      name: 'Support',
      matchers: [{ type: 'literal', field: 'to', value: 'x@example.com' }],
    }),
  ).toBe('x@example.com');
});

test('getRuleAlias: name then id as fallbacks; empty when nothing usable', () => {
  expect(getRuleAlias({ id: 'r', name: 'My rule', matchers: [] })).toBe('My rule');
  expect(getRuleAlias({ id: 'rule-42' })).toBe('rule-42');
  expect(getRuleAlias({ id: '' })).toBe('');
  expect(getRuleAlias(null)).toBe('');
});

test('getRuleAlias: catch-all matcher', () => {
  expect(getRuleAlias({ id: 'ca', matchers: [{ type: 'all' }] })).toBe('catch-all');
});

test('filterAliasRules: nameless worker rule is listed and searchable (regression)', () => {
  // Cloudflare's create-rule form does not ask for a name, so rules created there arrive
  // with name absent or "". Filtering on name hid every external rule from the SPA.
  const nameless: Rule = {
    id: 'worker_rule',
    matchers: [{ type: 'literal', field: 'to', value: 'x@example.com' }],
    actions: [{ type: 'worker', value: ['email-worker'] }],
  };
  const named: Rule = {
    id: 'fwd_rule',
    name: 'y@example.com',
    matchers: [{ type: 'literal', field: 'to', value: 'y@example.com' }],
    actions: [{ type: 'forward', value: ['d@example.com'] }],
  };
  const catchAll: Rule = {
    id: 'ca',
    matchers: [{ type: 'all' }],
    actions: [{ type: 'drop' }],
  };
  const listed = [nameless, named, catchAll];

  expect(filterAliasRules(listed, catchAll).map((r) => r.id)).toEqual([
    'worker_rule',
    'fwd_rule',
  ]);
  expect(filterAliasRules(listed, catchAll, 'x@').map((r) => r.id)).toEqual(['worker_rule']);
  expect(filterAliasRules(listed, catchAll, 'Support')).toEqual([]);
});

test('filterAliasRules: search also matches free-form name', () => {
  const rule: Rule = {
    id: 'r',
    name: 'Support inbox',
    matchers: [{ type: 'literal', field: 'to', value: 'help@example.com' }],
  };
  expect(filterAliasRules([rule], null, 'support').map((r) => r.id)).toEqual(['r']);
});

test('filterAliasRules: drops rules without a usable id', () => {
  expect(filterAliasRules([{ id: '', name: 'a@example.com' }], null)).toEqual([]);
});

test('getRuleDest: forward joins addresses', () => {
  expect(
    getRuleDest(en, { id: 'r', actions: [{ type: 'forward', value: ['a@x.com', 'b@x.com'] }] }),
  ).toBe('a@x.com, b@x.com');
});

test('getRuleDest: worker with a value', () => {
  expect(getRuleDest(en, { id: 'r', actions: [{ type: 'worker', value: ['my-worker'] }] })).toBe(
    'Worker: my-worker',
  );
});

test('getRuleDest: worker without a value', () => {
  expect(getRuleDest(en, { id: 'r', actions: [{ type: 'worker', value: [] }] })).toBe(
    'Email Worker',
  );
});

test('getRuleDest: drop is described in the active language', () => {
  expect(getRuleDest(en, { id: 'r', actions: [{ type: 'drop' }] })).toBe('Discard');
  expect(getRuleDest(es, { id: 'r', actions: [{ type: 'drop' }] })).toBe('Descartar');
});

test('getRuleDest: an action the panel does not model still shows its raw values', () => {
  // Several actions at once, or a type vuzon has never seen: not editable, but the row
  // must still say something rather than render blank.
  expect(
    getRuleDest(en, {
      id: 'r',
      actions: [{ type: 'forward', value: ['u@d.com'] }, { type: 'drop' }],
    }),
  ).toBe('u@d.com');
  expect(
    getRuleDest(en, { id: 'r', actions: [{ type: 'quarantine', value: ['somewhere'] }] }),
  ).toBe('somewhere');
});

test('describeRuleActions: mirrors the server classification', () => {
  const cases: Array<[Rule['actions'], string]> = [
    [[{ type: 'forward', value: ['a@x.com'] }], 'forward'],
    [[{ type: 'forward', value: 'a@x.com' }], 'forward'],
    [[{ type: 'forward', value: ['a@x.com', 'b@x.com'] }], 'fanout'],
    [[{ type: 'drop' }], 'drop'],
    [[{ type: 'worker', value: ['w'] }], 'worker'],
    [[{ type: 'worker', value: [] }], 'worker'],
    [[{ type: 'forward', value: ['  '] }], 'unknown'],
    [[{ type: 'quarantine', value: ['x'] }], 'unknown'],
    [[{ type: 'drop' }, { type: 'drop' }], 'unknown'],
    [[], 'unknown'],
    [undefined, 'unknown'],
  ];

  for (const [actions, kind] of cases) {
    expect(describeRuleActions({ id: 'r', actions }).kind, JSON.stringify(actions)).toBe(kind);
  }

  expect(describeRuleActions(null).kind).toBe('unknown');
  expect(describeRuleActions({ id: 'r', actions: [{ type: 'worker', value: ['w'] }] })).toEqual({
    kind: 'worker',
    destinations: [],
    workerName: 'w',
  });
});

test('isPanelEditableRule: only an undescribable action locks the editor', () => {
  expect(isPanelEditableRule({ id: 'r', actions: [{ type: 'worker', value: ['w'] }] })).toBe(true);
  expect(isPanelEditableRule({ id: 'r', actions: [{ type: 'drop' }] })).toBe(true);
  expect(isPanelEditableRule({ id: 'r', actions: [{ type: 'quarantine' }] })).toBe(false);
  expect(isPanelEditableRule(null)).toBe(false);
});

test('getRuleDest: no actions', () => {
  expect(getRuleDest(en, { id: 'r', actions: [] })).toBe('');
  expect(getRuleDest(en, { id: 'r' })).toBe('');
  expect(getRuleDest(en, null)).toBe('');
});

test('ruleMatchesCatchAllSlot: matcher type all with no catch-all loaded', () => {
  const rule: Rule = {
    id: 'ca',
    name: 'catch@example.com',
    matchers: [{ type: 'all' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, null)).toBe(true);
});

test('ruleMatchesCatchAllSlot: same id as the catch-all', () => {
  const rule: Rule = {
    id: 'same',
    name: 'Catch-all rule',
    matchers: [{ type: 'literal', field: 'to', value: 'x@y.com' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'same' })).toBe(true);
});

test('ruleMatchesCatchAllSlot: matcher all with a catch-all of a different id', () => {
  const rule: Rule = { id: 'listed_elsewhere', matchers: [{ type: 'all' }] };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'from_api' })).toBe(true);
});

test('ruleMatchesCatchAllSlot: a normal literal rule does not match', () => {
  const rule: Rule = {
    id: 'r1',
    matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'ca' })).toBe(false);
  expect(ruleMatchesCatchAllSlot(rule, null)).toBe(false);
});

test('generateRandomLocalPart: 8 characters from [0-9a-z]', () => {
  for (let i = 0; i < 20; i += 1) {
    expect(generateRandomLocalPart()).toMatch(/^[0-9a-z]{8}$/);
  }
});

test('generateRandomLocalPart: uses crypto, not Math.random', () => {
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
  const mathSpy = vi.spyOn(Math, 'random');

  expect(generateRandomLocalPart()).toMatch(/^[0-9a-z]{8}$/);
  expect(spy).toHaveBeenCalled();
  expect(mathSpy).not.toHaveBeenCalled();

  spy.mockRestore();
  mathSpy.mockRestore();
});

test('generateRandomLocalPart: discards out-of-range bytes without bias and keeps filling', () => {
  // 252..255 sit above the rejection limit (252) and must be discarded: with the whole
  // first block thrown away, the function has to ask for more bytes.
  let call = 0;
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    const bytes = array as Uint8Array;
    bytes.fill(call === 0 ? 254 : 0);
    call += 1;
    return array;
  });

  expect(generateRandomLocalPart()).toBe('00000000');
  expect(call).toBe(2);

  spy.mockRestore();
});

test('interpretAddDestError: a 429 from the local limiter is shown without the Error prefix', () => {
  const err = new ApiError('Too many requests.', 429, { code: 'rate_limit.api' });
  expect(interpretAddDestError(en, err)).toBe(
    'Too many requests. Wait a moment and try again.',
  );
  expect(interpretAddDestError(es, err)).toBe(
    'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  );
});

test('interpretAddDestError: another status is translated by code under the Error prefix', () => {
  const err = new ApiError('Invalid data', 400, {
    code: 'validation.invalid',
    params: { issues: [{ field: 'email', code: 'email.invalid' }] },
  });
  expect(interpretAddDestError(en, err)).toBe('Error: Email: invalid email format');
  expect(interpretAddDestError(es, err)).toBe('Error: Email: formato de correo inválido');
});

test('interpretAddDestError: an error with no code falls back to its own message', () => {
  expect(interpretAddDestError(en, new Error('Boom'))).toBe('Error: Boom');
});

test('interpretAddDestError: empty value', () => {
  expect(interpretAddDestError(en, undefined)).toBe('Error: Something went wrong');
});
