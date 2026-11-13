import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', '**/playwright-report', '**/test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Engine: pure TypeScript, must stay free of DOM / React / app code.
  {
    files: ['packages/engine/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'zustand'],
              message: 'The engine must not depend on UI libraries.',
            },
            {
              group: ['@mj/app', '**/app/**'],
              message: 'The engine must not import from the app.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in the engine.' },
        { name: 'document', message: 'No DOM in the engine.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded Rng from rng.ts for determinism.',
        },
      ],
    },
  },

  // App: browser + React.
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node-side config files.
  {
    files: ['**/*.config.{js,ts}', 'packages/app/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
);
