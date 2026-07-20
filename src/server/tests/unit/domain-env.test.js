import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getDomainConfigurationIssue,
  getPanelDomain,
} from '../../config/domain-env.js';

test('getDomainConfigurationIssue: accepts a valid domain', () => {
  assert.equal(getDomainConfigurationIssue({ DOMAIN: 'example.com' }), null);
});

test('getDomainConfigurationIssue: rejects a missing DOMAIN', () => {
  assert.match(getDomainConfigurationIssue({}), /DOMAIN/);
});

test('getDomainConfigurationIssue: rejects whitespace only', () => {
  assert.match(getDomainConfigurationIssue({ DOMAIN: '   ' }), /DOMAIN/);
});

test('getPanelDomain: trims whitespace', () => {
  assert.equal(getPanelDomain({ DOMAIN: '  example.com  ' }), 'example.com');
});
