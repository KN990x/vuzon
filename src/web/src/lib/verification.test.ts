import { expect, test } from 'vitest';
import { isVerifiedStatus } from './verification';

test('booleans y números', () => {
  expect(isVerifiedStatus(true)).toBe(true);
  expect(isVerifiedStatus(1)).toBe(true);
  expect(isVerifiedStatus(false)).toBe(false);
  expect(isVerifiedStatus(0)).toBe(false);
});

test('strings positivos (con normalización)', () => {
  expect(isVerifiedStatus('verified')).toBe(true);
  expect(isVerifiedStatus('  TRUE ')).toBe(true);
  expect(isVerifiedStatus('sí')).toBe(true);
  expect(isVerifiedStatus('active')).toBe(true);
});

test('strings negativos', () => {
  expect(isVerifiedStatus('pending')).toBe(false);
  expect(isVerifiedStatus('')).toBe(false);
  expect(isVerifiedStatus('no')).toBe(false);
});

test('timestamp ISO cuenta como verificado', () => {
  expect(isVerifiedStatus('2024-01-15T10:30:00Z')).toBe(true);
  expect(isVerifiedStatus('2024-01-15T10:30:00.123+02:00')).toBe(true);
  expect(isVerifiedStatus('2024-13-45T99:99:99Z')).toBe(false);
  expect(isVerifiedStatus('2024-01-15')).toBe(false);
});

test('objetos de estado de Cloudflare', () => {
  expect(isVerifiedStatus({ status: 'verified' })).toBe(true);
  expect(isVerifiedStatus({ verification_status: 'active' })).toBe(true);
  expect(isVerifiedStatus({ status: 'pending' })).toBe(false);
  expect(isVerifiedStatus({})).toBe(false);
});

test('valores nulos o desconocidos', () => {
  expect(isVerifiedStatus(null)).toBe(false);
  expect(isVerifiedStatus(undefined)).toBe(false);
});
