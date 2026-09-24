import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Modular monolith: a module may use another module only through its public index.
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./(?!\\.)[^/]+/(?!index\\.js$).+',
              message: 'Import other modules through their index.js (public facade), not their internals.',
            },
          ],
        },
      ],
    },
  },
);
