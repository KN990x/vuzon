import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPanelAuthConfigurationIssue,
  getPanelAuthCredentials,
} from '../../config/panel-auth-env.js';

test('getPanelAuthConfigurationIssue: acepta usuario y contraseña', () => {
  assert.equal(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: 'secret' }),
    null,
  );
});

test('getPanelAuthConfigurationIssue: rechaza contraseña vacía', () => {
  assert.match(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: '' }),
    /AUTH_USER y AUTH_PASS/,
  );
});

test('getPanelAuthConfigurationIssue: rechaza solo espacios', () => {
  assert.match(
    getPanelAuthConfigurationIssue({ AUTH_USER: 'admin', AUTH_PASS: '   ' }),
    /AUTH_USER y AUTH_PASS/,
  );
});

test('getPanelAuthCredentials: recorta espacios', () => {
  const { authUser, authPass } = getPanelAuthCredentials({
    AUTH_USER: '  admin  ',
    AUTH_PASS: '  secret  ',
  });
  assert.equal(authUser, 'admin');
  assert.equal(authPass, 'secret');
});

test('getPanelAuthCredentials: valores no string son vacíos', () => {
  const { authUser, authPass } = getPanelAuthCredentials({});
  assert.equal(authUser, '');
  assert.equal(authPass, '');
});
