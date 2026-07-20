import { expect, test } from 'vitest';
import { translateApiError } from './api-errors';
import { createTranslator } from './locale';

const en = createTranslator('en');
const es = createTranslator('es');

test('a known code is rendered in the active language, params included', () => {
  const err = {
    message: 'The alias a@example.com already exists.',
    code: 'rules.duplicate_alias',
    params: { alias: 'a@example.com' },
  };
  expect(translateApiError(en, err)).toBe('The alias a@example.com already exists.');
  expect(translateApiError(es, err)).toBe('El alias a@example.com ya existe.');
});

test('validation.invalid is expanded issue by issue', () => {
  const err = {
    message: 'Alias: …',
    code: 'validation.invalid',
    params: {
      issues: [
        { field: 'localPart', code: 'alias.empty' },
        { field: 'destEmail', code: 'dest_email.invalid' },
      ],
    },
  };
  expect(translateApiError(en, err)).toBe(
    'Alias: the alias cannot be empty. Destination email: invalid destination email',
  );
  expect(translateApiError(es, err)).toBe(
    'Alias: el alias no puede estar vacío. Email de destino: email de destino inválido',
  );
});

test('validation.invalid with no usable issues falls back to the generic message', () => {
  expect(translateApiError(es, { code: 'validation.invalid', params: { issues: [] } })).toBe(
    'Datos no válidos',
  );
});

// A code shipped by a newer server must degrade to readable prose, never to a blank.
test('an unknown code falls back to the English text the server sent', () => {
  expect(translateApiError(es, { message: 'Something novel', code: 'brand.new' })).toBe(
    'Something novel',
  );
});

test('an error with neither code nor message gets the generic copy', () => {
  expect(translateApiError(en, {})).toBe('Something went wrong');
  expect(translateApiError(es, null)).toBe('Algo ha fallado');
});

test('non-primitive params are dropped instead of rendering [object Object]', () => {
  const err = {
    message: 'fallback',
    code: 'dest.unknown',
    params: { email: { nested: true } },
  };
  expect(translateApiError(en, err)).toContain('{email}');
});
