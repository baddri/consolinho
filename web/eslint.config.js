// @ts-check
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (docs/architecture/FRONTEND.md "Folder structure"):
 * - `shared/` knows nothing about features or the app.
 * - a feature imports `shared/`, its own files, and other features only through their public `index.ts`.
 * - `app/` wires features together, again only through their `index.ts`.
 * - `test/` helpers may use anything public.
 */
const boundaryElements = [
  { type: 'app', pattern: 'src/app' },
  { type: 'shared', pattern: 'src/shared/*', capture: ['module'] },
  { type: 'feature', pattern: 'src/features/*', capture: ['featureName'] },
  { type: 'test', pattern: 'src/test' },
];

/** Allows importing another feature only through its public entry point. */
const featurePublicApi = { to: { element: { type: 'feature', fileInternalPath: 'index.ts' } } };

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'src/shared/api/schema.gen.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `onClick={() => setOpen(false)}` is idiomatic React; braces add noise without catching bugs.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, boundaries },
    extends: [jsxA11y.flatConfigs.strict],
    settings: {
      'boundaries/elements': boundaryElements,
      'boundaries/include': ['src/**/*'],
      'boundaries/files': [{ pattern: 'src/**/*.test.{ts,tsx}', category: 'test-file' }],
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // No direct DOM access: go through React/PatternFly. (The theme class on <html> is the one documented exception.)
      'no-restricted-properties': [
        'error',
        ...[
          'querySelector',
          'querySelectorAll',
          'getElementById',
          'getElementsByClassName',
          'getElementsByTagName',
        ].map((property) => ({
          object: 'document',
          property,
          message: 'No direct DOM access; use React refs or PatternFly.',
        })),
      ],
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // Files inside the same element (one feature, one shared module, app/) may import each other freely.
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            { from: { element: { type: 'shared' } }, allow: { to: { element: { type: 'shared' } } } },
            // Colocated tests may use the shared test helpers (MSW server, render helpers).
            { from: { file: { categories: 'test-file' } }, allow: { to: { element: { type: 'test' } } } },
            {
              from: { element: { type: 'feature' } },
              allow: [{ to: { element: { type: 'shared' } } }, featurePublicApi],
            },
            {
              from: { element: { type: 'app' } },
              allow: [{ to: { element: { type: 'shared' } } }, featurePublicApi],
            },
            {
              from: { element: { type: 'test' } },
              allow: [{ to: { element: { types: ['app', 'shared'] } } }, featurePublicApi],
            },
          ],
        },
      ],
    },
  },
  {
    // main.tsx mounts React into index.html's #root — the only place a DOM lookup is legitimate.
    files: ['src/app/main.tsx'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['**/*.{js,mjs}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
