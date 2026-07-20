import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCloudflareEnvConfigured,
  getCfApiToken,
  getCfApiTokenConfigurationIssue,
  getCloudflareIdsConfigurationIssueIfFullySpecified,
} from '../../config/cloudflare-env.js';

test('getCfApiToken: trims whitespace', () => {
  assert.equal(getCfApiToken({ CF_API_TOKEN: '  abc  ' }), 'abc');
});

test('getCfApiTokenConfigurationIssue: rejects an empty value', () => {
  assert.match(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: '' }), /CF_API_TOKEN/);
  assert.match(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: '   ' }), /CF_API_TOKEN/);
  assert.equal(getCfApiTokenConfigurationIssue({ CF_API_TOKEN: 'tok' }), null);
});

test('assertCloudflareEnvConfigured: accepts valid IDs', () => {
  assertCloudflareEnvConfigured({
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
  });
});

test('assertCloudflareEnvConfigured: normalizes IDs with surrounding whitespace', () => {
  const env = {
    CF_ZONE_ID: '  zone_test_1  ',
    CF_ACCOUNT_ID: '\tacct_test_1\n',
  };
  assertCloudflareEnvConfigured(env);
  assert.equal(env.CF_ZONE_ID, 'zone_test_1');
  assert.equal(env.CF_ACCOUNT_ID, 'acct_test_1');
});

test('assertCloudflareEnvConfigured: rejects an empty zone', () => {
  assert.throws(
    () => assertCloudflareEnvConfigured({
      CF_ZONE_ID: '',
      CF_ACCOUNT_ID: 'acct_test_1',
    }),
    /CF_ZONE_ID/,
  );
});

test('assertCloudflareEnvConfigured: rejects an account with invalid characters', () => {
  assert.throws(
    () => assertCloudflareEnvConfigured({
      CF_ZONE_ID: 'valid_zone_id',
      CF_ACCOUNT_ID: 'bad id',
    }),
    /CF_ACCOUNT_ID/,
  );
});

test('getCloudflareIdsConfigurationIssueIfFullySpecified: null when either ID is missing', () => {
  assert.equal(
    getCloudflareIdsConfigurationIssueIfFullySpecified({
      CF_ZONE_ID: 'zone_test_1',
    }),
    null,
  );
});

test('getCloudflareIdsConfigurationIssueIfFullySpecified: detects an invalid ID when both are set', () => {
  const issue = getCloudflareIdsConfigurationIssueIfFullySpecified({
    CF_ZONE_ID: 'bad zone',
    CF_ACCOUNT_ID: 'acct_test_1',
  });
  assert.match(issue, /CF_ZONE_ID/);
});
