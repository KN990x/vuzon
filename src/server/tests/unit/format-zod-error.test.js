import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectZodIssues, formatZodError } from '../../platform/http/format-zod-error.js';
import { addressSchema, ruleSchema } from '../../features/email-routing/validation.js';

function errorFor(schema, value) {
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, false, 'expected a validation failure');
  return parsed.error;
}

test('formatZodError: maps the field to its English label and the slug to prose', () => {
  const message = formatZodError(errorFor(addressSchema, { email: 'not-an-email' }));
  assert.equal(message, 'Email: invalid email format');
});

test('formatZodError: uses the alias and action labels', () => {
  const validAction = { type: 'forward', value: ['dest@example.com'] };
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: '', action: validAction })),
    /^Alias: /,
  );
  assert.match(
    formatZodError(errorFor(ruleSchema, { localPart: 'alias', action: { type: 'nope' } })),
    /^Action: /,
  );
});

test('formatZodError: joins several issues with a period', () => {
  const message = formatZodError(errorFor(ruleSchema, { localPart: '', action: { type: 'nope' } }));
  assert.match(message, /^Alias: .+\. Action: /);
});

test('formatZodError: a field with no known label uses its own name', () => {
  const error = { issues: [{ path: ['unknown'], message: 'something.broke' }] };
  assert.equal(formatZodError(error), 'unknown: something.broke');
});

test('formatZodError: with no usable path it returns just the message', () => {
  const error = { issues: [{ path: [], message: 'something.broke' }] };
  assert.equal(formatZodError(error), 'something.broke');
});

test('formatZodError: input without issues falls back to the generic message', () => {
  assert.equal(formatZodError(undefined), 'Invalid data');
  assert.equal(formatZodError({}), 'Invalid data');
  assert.equal(formatZodError({ issues: [] }), 'Invalid data');
});

// The slug list is what lets the SPA render the issue in the chosen language; the prose
// above is only the fallback for clients with no catalogue.
test('collectZodIssues: exposes the slug of every field', () => {
  assert.deepEqual(
    collectZodIssues(errorFor(ruleSchema, {
      localPart: 'UPPER',
      action: { type: 'forward', value: ['x'] },
    })),
    [
      { field: 'localPart', code: 'alias.charset' },
      // The path is ['action', 'value', 0]; only its head names the field the user sees.
      { field: 'action', code: 'dest_email.invalid' },
    ],
  );
});

test('collectZodIssues: input without issues yields an empty list', () => {
  assert.deepEqual(collectZodIssues(undefined), []);
  assert.deepEqual(collectZodIssues({ issues: 'nope' }), []);
});
