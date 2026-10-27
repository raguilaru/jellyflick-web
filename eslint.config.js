import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JavaScript: the build script (Node) and the runtime config
    // placeholder the container overwrites (browser).
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // ADR 0002 / Chromium 68: Oxc cannot downlevel top-level await. The build
      // only warns and then emits code the target cannot parse, so ban it here.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program > ExpressionStatement > AwaitExpression',
          message: 'Top-level await is not available on Chromium 68.',
        },
        {
          selector: 'Program > VariableDeclaration AwaitExpression',
          message: 'Top-level await is not available on Chromium 68.',
        },
      ],
      // These are not on Chromium 68 and are not polyfilled. See src/polyfills.ts
      // for the shims that are shipped.
      'no-restricted-properties': [
        'error',
        { object: 'Object', property: 'hasOwn', message: 'Object.hasOwn is Chrome 93. Use a `key in obj` check.' },
        { object: 'Promise', property: 'any', message: 'Promise.any is Chrome 85. Use Promise.race over settled promises.' },
        { object: 'window', property: 'structuredClone', message: 'structuredClone is Chrome 98. Copy explicitly.' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
