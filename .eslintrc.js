module.exports = {
    root: true,
    env: {
      browser: true,
      node: true,
    },
    plugins: ['@typescript-eslint'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        2,
        {
          allowString: false,
          allowNumber: false,
        },
      ],
    },
    ignorePatterns: ['src/**/*.test.ts', 'src/**/*.d.ts'],
  };