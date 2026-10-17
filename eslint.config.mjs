// Lint config for the Node/TypeScript workspaces (functions, packages/*).
// The Expo app has its own config in app/eslint.config.js (eslint-config-expo).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/lib/**', '**/dist/**', 'app/**', '**/*.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
