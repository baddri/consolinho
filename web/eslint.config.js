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
 * - `mocks/` (MSW mock backend, ADR-0016) builds on `shared/` only; of `app/`, only `main.tsx` may import it (mock-mode
 *   bootstrap, T-0042), and `test/` may too.
 * - `test/` helpers may use anything public.
 */
const boundaryElements = [
  { type: 'app', pattern: 'src/app' },
  { type: 'shared', pattern: 'src/shared/*', capture: ['module'] },
  { type: 'feature', pattern: 'src/features/*', capture: ['featureName'] },
  { type: 'mocks', pattern: 'src/mocks' },
  { type: 'test', pattern: 'src/test' },
];

/**
 * No direct DOM access (FRONTEND.md "UI conventions"): DOM lookups are banned everywhere, and reaching the document
 * through `window`/`globalThis`/`self` is banned like the bare `document` global (see `noDocumentGlobal`).
 */
const domMessage = 'No direct DOM access; use React refs or PatternFly (docs/architecture/FRONTEND.md).';
const domLookupBans = [
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
].map((property) => ({ object: 'document', property, message: domMessage }));
const documentViaGlobalBans = ['window', 'globalThis', 'self'].map((object) => ({
  object,
  property: 'document',
  message: domMessage,
}));
const noDocumentGlobal = ['error', { name: 'document', message: domMessage }];

/** Files allowed to touch `document`: mount point, <html> theme class, Fullscreen API, tests. Lookups stay banned. */
const documentAllowedFiles = [
  'src/app/main.tsx',
  'src/shared/theme/ThemeProvider.tsx',
  // The Fullscreen API's state and exit are document-level (YAML editor full screen T-0123, Logs "Expand" T-0179).
  'src/shared/hooks/useFullscreen.ts',
  'src/**/*.test.{ts,tsx}',
  'src/test/**',
];

/**
 * Admin URLs are built by `fleetAdminPath()` only (ADR-0033 §3, FLEET-7): a string or template head starting with
 * `/admin` is a pre-CP3.7 path. The legacy redirect and its test are the exceptions (see below).
 */
const legacyAdminPathMessage = 'Use fleetAdminPath() (ADR-0033).';
const noLegacyAdminPaths = [
  'error',
  { selector: 'Literal[value=/^\\/admin(\\/|$)/]', message: legacyAdminPathMessage },
  {
    selector: 'TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/admin(\\/|$)/]',
    message: legacyAdminPathMessage,
  },
];

/** xterm.js stays behind the `shared/ui/terminal` wrapper (lazy-loaded, themed, disposed in one place). */
const noDirectXterm = [
  'error',
  { patterns: [{ group: ['@xterm/*'], message: 'Use shared/ui/terminal (ADR on terminal).' }] },
];

/** Allows importing another feature only through its public entry point. */
const featurePublicApi = { to: { element: { type: 'feature', fileInternalPath: 'index.ts' } } };

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'e2e/.results',
      'node_modules',
      'src/shared/api/schema.gen.ts',
      // Generated MSW worker script (`npx msw init msw`), served only in mock mode.
      'msw',
    ],
  },
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
      'no-restricted-syntax': noLegacyAdminPaths,
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
      'boundaries/files': [
        { pattern: 'src/**/*.test.{ts,tsx}', category: 'test-file' },
        { pattern: 'src/app/main.tsx', category: 'mock-bootstrap' },
      ],
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // No direct DOM access: go through React/PatternFly. Exceptions: `documentAllowedFiles` below.
      'no-restricted-globals': noDocumentGlobal,
      'no-restricted-properties': ['error', ...domLookupBans, ...documentViaGlobalBans],
      'no-restricted-imports': noDirectXterm,
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
            // Mock mode (`npm run dev:mock`) starts the MSW browser worker from the entry point only.
            {
              from: { file: { categories: 'mock-bootstrap' } },
              allow: { to: { element: { type: 'mocks' } } },
            },
            { from: { element: { type: 'mocks' } }, allow: { to: { element: { type: 'shared' } } } },
            {
              from: { element: { type: 'test' } },
              allow: [{ to: { element: { types: ['app', 'shared', 'mocks'] } } }, featurePublicApi],
            },
          ],
        },
      ],
    },
  },
  {
    files: documentAllowedFiles,
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': ['error', ...domLookupBans],
    },
  },
  {
    // The legacy `/admin` → `/fleet/admin` redirect has to name the old prefix (ADR-0033 §2).
    files: ['src/features/admin/LegacyAdminRedirect.tsx', 'src/features/admin/LegacyAdminRedirect.test.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The terminal wrapper is the one place that may import xterm.js.
    files: ['src/shared/ui/terminal/**'],
    rules: { 'no-restricted-imports': 'off' },
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
