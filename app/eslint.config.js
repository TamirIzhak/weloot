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
    // Node scripts and config files run in Node, not React Native.
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: { globals: require('globals').node },
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
  {
    // CLAUDE.md §5: no user-facing string literals in components; use t('feature.key') (issue #5).
    // Checks JSX text and the props that reach the screen or screen readers.
    files: ['src/**/*.tsx'],
    ignores: ['src/features/dev/**'],
    plugins: { i18next: require('eslint-plugin-i18next') },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: [
              'label',
              'title',
              'body',
              'message',
              'placeholder',
              'helper',
              'error',
              'retryLabel',
              'accessibilityLabel',
              'accessibilityHint',
            ],
          },
        },
      ],
    },
  },
]);
