import { expect, test, vi } from 'vitest';
import { ApiError } from './api';
import {
  generateRandomLocalPart,
  getRuleDest,
  getSingleForwardDestination,
  interpretAddDestError,
  ruleMatchesCatchAllSlot,
} from './rules';
import type { Rule } from './types';

test('getSingleForwardDestination: a forward to a single address is editable', () => {
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: ['a@x.com'] }] }),
  ).toBe('a@x.com');
  // Cloudflare también ha devuelto el destino como cadena suelta.
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: 'a@x.com' }] }),
  ).toBe('a@x.com');
});

test('getSingleForwardDestination: anything that is not a plain forward is not editable', () => {
  // Replacing any of these with a forward would destroy external configuration.
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

test('getRuleDest: forward joins addresses', () => {
  expect(
    getRuleDest({ id: 'r', actions: [{ type: 'forward', value: ['a@x.com', 'b@x.com'] }] }),
  ).toBe('a@x.com, b@x.com');
});

test('getRuleDest: worker with a value', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'worker', value: ['mi-worker'] }] })).toBe(
    'Worker: mi-worker',
  );
});

test('getRuleDest: worker without a value', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'worker', value: [] }] })).toBe('Email Worker');
});

test('getRuleDest: drop', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'drop' }] })).toBe('Descartar');
});

test('getRuleDest: several actions', () => {
  expect(
    getRuleDest({
      id: 'r',
      actions: [{ type: 'forward', value: ['u@d.com'] }, { type: 'drop' }],
    }),
  ).toBe('u@d.com · Descartar');
});

test('getRuleDest: no actions', () => {
  expect(getRuleDest({ id: 'r', actions: [] })).toBe('');
  expect(getRuleDest({ id: 'r' })).toBe('');
  expect(getRuleDest(null)).toBe('');
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

test('interpretAddDestError: a 429 from the local limiter is detected by status', () => {
  expect(interpretAddDestError(new ApiError('Demasiadas peticiones. Espera unos minutos.', 429))).toBe(
    'Límite de solicitudes alcanzado. Espera unos segundos.',
  );
});

test('interpretAddDestError: an ApiError with another status keeps its message', () => {
  expect(interpretAddDestError(new ApiError('Email inválido', 400))).toBe('Error: Email inválido');
});

test('interpretAddDestError: a generic error keeps its message', () => {
  expect(interpretAddDestError(new Error('Email inválido'))).toBe('Error: Email inválido');
});

test('interpretAddDestError: empty value', () => {
  expect(interpretAddDestError(undefined)).toBe('Error: Desconocido');
});
