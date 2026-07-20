import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPanelAuthConfigurationIssue,
  getPanelAuthCredentials,
} from '../../config/panel-auth-env.js';

test('getPanelAuthConfigurationIssue: accepts user and password', () => {
  assert.equal(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: 'secret' }),
    null,
  );
});

test('getPanelAuthConfigurationIssue: rejects an empty password', () => {
  assert.match(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: '' }),
    /AUTH_USER and AUTH_PASS/,
  );
});

test('getPanelAuthConfigurationIssue: rejects whitespace only', () => {
  assert.match(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: '   ' }),
    /AUTH_USER and AUTH_PASS/,
  );
});

test('getPanelAuthCredentials: trims whitespace', () => {
  const { authUser, authPass } = getPanelAuthCredentials({
    AUTH_USER: '  admin  ',
    AUTH_PASS: '  secret  ',
  });
  assert.equal(authUser, 'admin');
  assert.equal(authPass, 'secret');
});

test('getPanelAuthCredentials: non-string values come out empty', () => {
  const { authUser, authPass } = getPanelAuthCredentials({});
  assert.equal(authUser, '');
  assert.equal(authPass, '');
});
