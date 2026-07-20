import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getDomainConfigurationIssue,
  getPanelDomain,
} from '../../config/domain-env.js';

test('getDomainConfigurationIssue: acepta dominio válido', () => {
  assert.equal(getDomainConfigurationIssue({ DOMAIN: 'example.com' }), null);
});

test('getDomainConfigurationIssue: rechaza DOMAIN ausente', () => {
  assert.match(getDomainConfigurationIssue({}), /DOMAIN/);
});

test('getDomainConfigurationIssue: rechaza solo espacios', () => {
  assert.match(getDomainConfigurationIssue({ DOMAIN: '   ' }), /DOMAIN/);
});

test('getPanelDomain: recorta espacios', () => {
  assert.equal(getPanelDomain({ DOMAIN: '  example.com  ' }), 'example.com');
});
