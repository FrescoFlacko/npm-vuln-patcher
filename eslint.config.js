export default [
  {
    ignores: ['coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'prefer-const': 'error',
    },
  },
];
