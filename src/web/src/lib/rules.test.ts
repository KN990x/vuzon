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

test('getSingleForwardDestination: forward a una sola dirección es editable', () => {
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: ['a@x.com'] }] }),
  ).toBe('a@x.com');
  // Cloudflare también ha devuelto el destino como cadena suelta.
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: 'a@x.com' }] }),
  ).toBe('a@x.com');
});

test('getSingleForwardDestination: lo que no es un forward simple no es editable', () => {
  // Sustituir cualquiera de estos por un forward destruiría configuración externa.
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

test('getSingleForwardDestination: entradas vacías o inválidas devuelven null', () => {
  expect(getSingleForwardDestination(null)).toBeNull();
  expect(getSingleForwardDestination(undefined)).toBeNull();
  expect(getSingleForwardDestination({ id: 'r' })).toBeNull();
  expect(getSingleForwardDestination({ id: 'r', actions: [] })).toBeNull();
  expect(
    getSingleForwardDestination({ id: 'r', actions: [{ type: 'forward', value: ['  '] }] }),
  ).toBeNull();
});

test('getRuleDest: forward une correos', () => {
  expect(
    getRuleDest({ id: 'r', actions: [{ type: 'forward', value: ['a@x.com', 'b@x.com'] }] }),
  ).toBe('a@x.com, b@x.com');
});

test('getRuleDest: worker con value', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'worker', value: ['mi-worker'] }] })).toBe(
    'Worker: mi-worker',
  );
});

test('getRuleDest: worker sin value', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'worker', value: [] }] })).toBe('Email Worker');
});

test('getRuleDest: drop', () => {
  expect(getRuleDest({ id: 'r', actions: [{ type: 'drop' }] })).toBe('Descartar');
});

test('getRuleDest: varias acciones', () => {
  expect(
    getRuleDest({
      id: 'r',
      actions: [{ type: 'forward', value: ['u@d.com'] }, { type: 'drop' }],
    }),
  ).toBe('u@d.com · Descartar');
});

test('getRuleDest: sin acciones', () => {
  expect(getRuleDest({ id: 'r', actions: [] })).toBe('');
  expect(getRuleDest({ id: 'r' })).toBe('');
  expect(getRuleDest(null)).toBe('');
});

test('ruleMatchesCatchAllSlot: matcher type all sin catch-all cargado', () => {
  const rule: Rule = {
    id: 'ca',
    name: 'catch@example.com',
    matchers: [{ type: 'all' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, null)).toBe(true);
});

test('ruleMatchesCatchAllSlot: mismo id que el catch-all', () => {
  const rule: Rule = {
    id: 'same',
    name: 'Catch-all rule',
    matchers: [{ type: 'literal', field: 'to', value: 'x@y.com' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'same' })).toBe(true);
});

test('ruleMatchesCatchAllSlot: matcher all con catch-all de id distinto', () => {
  const rule: Rule = { id: 'listed_elsewhere', matchers: [{ type: 'all' }] };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'from_api' })).toBe(true);
});

test('ruleMatchesCatchAllSlot: regla literal normal no coincide', () => {
  const rule: Rule = {
    id: 'r1',
    matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
  };
  expect(ruleMatchesCatchAllSlot(rule, { id: 'ca' })).toBe(false);
  expect(ruleMatchesCatchAllSlot(rule, null)).toBe(false);
});

test('generateRandomLocalPart: 8 caracteres [0-9a-z]', () => {
  for (let i = 0; i < 20; i += 1) {
    expect(generateRandomLocalPart()).toMatch(/^[0-9a-z]{8}$/);
  }
});

test('generateRandomLocalPart: usa crypto, no Math.random', () => {
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
  const mathSpy = vi.spyOn(Math, 'random');

  expect(generateRandomLocalPart()).toMatch(/^[0-9a-z]{8}$/);
  expect(spy).toHaveBeenCalled();
  expect(mathSpy).not.toHaveBeenCalled();

  spy.mockRestore();
  mathSpy.mockRestore();
});

test('generateRandomLocalPart: descarta bytes fuera del rango sin sesgo y sigue rellenando', () => {
  // 252..255 quedan por encima del límite de rechazo (252) y deben descartarse:
  // con el primer bloque entero descartado, la función debe pedir más bytes.
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

test('interpretAddDestError: 429 del limiter local (mensaje en español) por status', () => {
  expect(interpretAddDestError(new ApiError('Demasiadas peticiones. Espera unos minutos.', 429))).toBe(
    'Límite de solicitudes alcanzado. Espera unos segundos.',
  );
});

test('interpretAddDestError: ApiError con otro status conserva el mensaje', () => {
  expect(interpretAddDestError(new ApiError('Email inválido', 400))).toBe('Error: Email inválido');
});

test('interpretAddDestError: error genérico conserva el mensaje', () => {
  expect(interpretAddDestError(new Error('Email inválido'))).toBe('Error: Email inválido');
});

test('interpretAddDestError: valor vacío', () => {
  expect(interpretAddDestError(undefined)).toBe('Error: Desconocido');
});
