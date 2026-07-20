import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatZodError } from '../../platform/http/format-zod-error.js';
import { addressSchema, ruleSchema } from '../../features/email-routing/validation.js';

function errorFor(schema, value) {
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, false, 'se esperaba un fallo de validación');
  return parsed.error;
}

test('formatZodError: traduce el nombre del campo a su etiqueta en español', () => {
  const message = formatZodError(errorFor(addressSchema, { email: 'no-es-correo' }));
  assert.equal(message, 'Email: Formato de correo inválido');
});

test('formatZodError: usa las etiquetas de alias y email de destino', () => {
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: '', destEmail: 'dest@example.com' })),
    /^Alias: /,
  );
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: 'alias', destEmail: 'x' })),
    /^Email de destino: /,
  );
});

test('formatZodError: une varios problemas con punto', () => {
  const message = formatZodError(errorFor(ruleSchema, { localPart: '', destEmail: 'x' }));
  assert.match(message, /^Alias: .+\. Email de destino: /);
});

test('formatZodError: campo sin etiqueta conocida usa su propio nombre', () => {
  const error = { issues: [{ path: ['desconocido'], message: 'algo falla' }] };
  assert.equal(formatZodError(error), 'desconocido: algo falla');
});

test('formatZodError: sin path utilizable devuelve solo el mensaje', () => {
  const error = { issues: [{ path: [], message: 'algo falla' }] };
  assert.equal(formatZodError(error), 'algo falla');
});

test('formatZodError: entrada sin issues cae en el mensaje genérico', () => {
  assert.equal(formatZodError(undefined), 'Datos no válidos');
  assert.equal(formatZodError({}), 'Datos no válidos');
  assert.equal(formatZodError({ issues: [] }), 'Datos no válidos');
});
