import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatZodError } from '../../platform/http/format-zod-error.js';
import { addressSchema, ruleSchema } from '../../features/email-routing/validation.js';

function errorFor(schema, value) {
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, false, 'expected a validation failure');
  return parsed.error;
}

test('formatZodError: maps the field name to its Spanish label', () => {
  const message = formatZodError(errorFor(addressSchema, { email: 'no-es-correo' }));
  assert.equal(message, 'Email: Formato de correo inválido');
});

test('formatZodError: uses the alias and destination-email labels', () => {
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: '', destEmail: 'dest@example.com' })),
    /^Alias: /,
  );
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: 'alias', destEmail: 'x' })),
    /^Email de destino: /,
  );
});

test('formatZodError: joins several issues with a period', () => {
  const message = formatZodError(errorFor(ruleSchema, { localPart: '', destEmail: 'x' }));
  assert.match(message, /^Alias: .+\. Email de destino: /);
});

test('formatZodError: a field with no known label uses its own name', () => {
  const error = { issues: [{ path: ['desconocido'], message: 'algo falla' }] };
  assert.equal(formatZodError(error), 'desconocido: algo falla');
});

test('formatZodError: with no usable path it returns just the message', () => {
  const error = { issues: [{ path: [], message: 'algo falla' }] };
  assert.equal(formatZodError(error), 'algo falla');
});

test('formatZodError: input without issues falls back to the generic message', () => {
  assert.equal(formatZodError(undefined), 'Datos no válidos');
  assert.equal(formatZodError({}), 'Datos no válidos');
  assert.equal(formatZodError({ issues: [] }), 'Datos no válidos');
});
