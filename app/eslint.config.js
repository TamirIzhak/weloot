// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEX_COLOR = '^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // CLAUDE.md §5: colors come from the design tokens (src/theme), never raw hex in app code.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${HEX_COLOR}/]`,
          message:
            'Use a design token (Tailwind class or colors from @/theme/tokens) instead of a raw hex color.',
        },
        {
          selector: `TemplateElement[value.raw=/${HEX_COLOR}/]`,
          message:
            'Use a design token (Tailwind class or colors from @/theme/tokens) instead of a raw hex color.',
        },
      ],
    },
  },
]);
