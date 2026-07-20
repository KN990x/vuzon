import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCloudflareEnvConfigured,
  getCfApiToken,
  getCfApiTokenConfigurationIssue,
  getCloudflareIdsConfigurationIssueIfFullySpecified,
} from '../../config/cloudflare-env.js';

test('getCfApiToken: trim de espacios', () => {
  assert.equal(getCfApiToken({ CF_API_TOKEN: '  abc  ' }), 'abc');
});

test('getCfApiTokenConfigurationIssue: rechaza vacío', () => {
  assert.match(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: '' }), /CF_API_TOKEN/);
  assert.match(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: '   ' }), /CF_API_TOKEN/);
  assert.equal(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: 'tok' }), null);
});

test('assertCloudflareEnvConfigured: acepta IDs válidos', () => {
  assertCloudflareEnvConfigured({
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
  });
});

test('assertCloudflareEnvConfigured: normaliza IDs con espacios laterales', () => {
  const env = {
    CF_ZONE_ID: '  zone_test_1  ',
    CF_ACCOUNT_ID: '\tacct_test_1\n',
  };
  assertCloudflareEnvConfigured(env);
  assert.equal(env.CF_ZONE_ID, 'zone_test_1');
  assert.equal(env.CF_ACCOUNT_ID, 'acct_test_1');
});

test('assertCloudflareEnvConfigured: rechaza zone vacío', () => {
  assert.throws(
    () => assertCloudflareEnvConfigured({
      CF_ZONE_ID: '',
      CF_ACCOUNT_ID: 'acct_test_1',
    }),
    /CF_ZONE_ID/,
  );
});

test('assertCloudflareEnvConfigured: rechaza account con caracteres inválidos', () => {
  assert.throws(
    () => assertCloudflareEnvConfigured({
      CF_ZONE_ID: 'valid_zone_id',
      CF_ACCOUNT_ID: 'bad id',
    }),
    /CF_ACCOUNT_ID/,
  );
});

test('getCloudflareIdsConfigurationIssueIfFullySpecified: null si falta algún ID', () => {
  assert.equal(
    getCloudflareIdsConfigurationIssueIfFullySpecified({
      CF_ZONE_ID: 'zone_test_1',
    }),
    null,
  );
});

test('getCloudflareIdsConfigurationIssueIfFullySpecified: detecta ID inválido cuando ambos están', () => {
  const issue = getCloudflareIdsConfigurationIssueIfFullySpecified({
    CF_ZONE_ID: 'bad zone',
    CF_ACCOUNT_ID: 'acct_test_1',
  });
  assert.match(issue, /CF_ZONE_ID/);
});
