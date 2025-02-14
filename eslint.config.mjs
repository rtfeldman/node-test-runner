import js from '@eslint/js';
import mocha from 'eslint-plugin-mocha';
import globals from 'globals';

export default [
  {
    ignores: [
      //
      '**/elm-stuff',
      '**/fixtures',
      '**/templates',
      '**/flow-typed',
    ],
  },
  {
    rules: {
      ...js.configs.recommended.rules,
      'no-inner-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['tests/*'],
    plugins: {
      mocha,
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      'mocha/handle-done-callback': 'error',
      'mocha/no-exclusive-tests': 'error',
      'mocha/no-exports': 'error',
      'mocha/no-identical-title': 'error',
      'mocha/no-nested-tests': 'error',
      'mocha/no-skipped-tests': 'error',
    },
  },
];
