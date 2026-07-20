import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'src/web/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
];
