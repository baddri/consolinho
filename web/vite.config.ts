/// <reference types="vitest/config" />
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// Relative path, not `@/…`: the config is bundled before the app's alias exists. The file is pure (no DOM).
import { sanitizeReturnUrl } from './src/shared/auth/returnUrl';

/**
 * Where the dev server forwards `/api` requests.
 *
 * Under `aspire run` the AppHost injects the Api's endpoints as environment variables following the
 * service-discovery convention `services__<resource>__<endpoint>__<index>` (here resource `api`). HTTPS is preferred
 * when present; outside Aspire we fall back to the Api's launch-profile port (5180).
 */
const apiTarget =
  process.env.services__api__https__0 ?? process.env.services__api__http__0 ?? 'http://localhost:5180';

/**
 * Stable vendor chunks (FRONTEND.md "Routing", route-level code splitting). Libraries change far less often than app
 * code, so keeping them in their own chunks lets browsers reuse them across deployments, and keeps every chunk under
 * Vite's 500 kB warning without raising `chunkSizeWarningLimit`. App pages are split by React Router `lazy` routes.
 * Patterns match the package directory after the last `node_modules/` (`[\\/]` keeps them working on Windows).
 */
const vendorChunks = [
  { name: 'vendor-react', test: /node_modules[\\/](?:react|react-dom|react-router|scheduler|cookie)[\\/]/ },
  // PF's CodeEditor belongs to `vendor-monaco`, not here: it imports Monaco's React wrapper. `maxSize` (bytes before
  // minification) keeps each part under the 500 kB warning as PatternFly usage grows.
  {
    name: 'vendor-patternfly',
    test: /node_modules[\\/]@patternfly[\\/](?!react-code-editor[\\/])/,
    maxSize: 900 * 1024,
  },
  {
    name: 'vendor-data',
    test: /node_modules[\\/](?:@tanstack|react-hook-form|@hookform|zod|openapi-fetch)[\\/]/,
  },
  // Vite's dynamic-import helper, used by the app's lazy routes and by Monaco's lazy YAML tokenizer: claimed here so
  // `vendor-monaco` (which also captures its modules' dependencies) can't pull it in and make the main bundle import it.
  { name: 'vite-preload', test: /vite[\\/]preload-helper/ },
  // The YAML editor stack — Monaco, monaco-yaml (ADR-0038 §6) and its main-thread helpers, its React wrapper, PF's
  // CodeEditor and its upload dependency — is imported only by
  // the lazy YAML route (ADR-0024 §3). Last on purpose: a group also captures its modules' dependencies, so the groups
  // above must claim React/PatternFly first, or the main bundle would import them from Monaco's chunks. Monaco is
  // ~4 MB: `maxSize` (measured before minification) splits it into parts of at most ~420 kB minified.
  {
    name: 'vendor-monaco',
    test: /node_modules[\\/](?:monaco-editor|@monaco-editor|monaco-yaml|monaco-languageserver-types|monaco-marker-data-provider|monaco-worker-manager|@patternfly[\\/]react-code-editor|react-dropzone|file-selector|attr-accept)[\\/]/,
    maxSize: 1200 * 1024,
  },
];

/** Module of `@monaco-editor/loader` that holds its default CDN location, and that location's pattern. */
const MONACO_LOADER_CONFIG = /node_modules[\\/]@monaco-editor[\\/]loader[\\/]lib[\\/]es[\\/]config[\\/]index\.js$/;
const MONACO_CDN_URL = /https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@[^'"`]*/;

/**
 * Removes `@monaco-editor/loader`'s default CDN URL from the bundle (ADR-0024 §2). `monacoSetup.ts` hands the loader
 * the bundled Monaco, so the URL is never used — but a dormant CDN address is exactly what an air-gapped deployment
 * and the CSP must not depend on, so the build drops it (a missed `loader.config` then fails loudly instead of
 * silently fetching from the internet). Throws if the pattern disappears, so a loader upgrade gets re-checked.
 */
function stripMonacoCdnDefault(): Plugin {
  return {
    name: 'fleetconsole-strip-monaco-cdn',
    apply: 'build',
    transform(code, id) {
      if (!MONACO_LOADER_CONFIG.test(id)) return null;
      if (!MONACO_CDN_URL.test(code)) {
        throw new Error(`@monaco-editor/loader no longer has the expected CDN default in ${id}; re-check ADR-0024.`);
      }
      return { code: code.replace(MONACO_CDN_URL, ''), map: null };
    },
  };
}

/** Vite mode of `npm run dev:mock`: the SPA runs against the MSW browser worker instead of the Api (T-0042). */
const MOCK_MODE = 'mock';

/**
 * Mock mode only: answers the "Log in with OpenShift" navigation (`/api/auth/login?returnUrl=…`) by redirecting to
 * `returnUrl` when no MSW worker controls the page yet (first load, bookmarked link); once it does, the worker's own
 * handler in `src/mocks/browser.ts` answers instead. The reload restarts the in-memory mock backend signed in as the
 * configured persona, so logging out and back in works without the Api.
 */
function mockLoginRedirect(): Plugin {
  return {
    name: 'fleetconsole-mock-login',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/auth/login', (req, res) => {
        const returnUrl = new URL(req.originalUrl ?? '/', 'http://mock.local').searchParams.get('returnUrl');
        res.statusCode = 302;
        res.setHeader('Location', sanitizeReturnUrl(returnUrl));
        res.end();
      });
    },
  };
}

/** MSW's browser worker (`npx msw init msw/`), kept outside `public/` so it can never be copied into `dist/`. */
const MSW_WORKER_FILE = 'mockServiceWorker.js';

/**
 * Mock mode only: serves `msw/mockServiceWorker.js` at `/mockServiceWorker.js`, next to the regular `public/` assets
 * (`theme-init.js`, `favicon.svg`). Vite supports a single `publicDir`, so pointing it at `msw/` would hide `public/`;
 * this middleware adds the one worker file instead. `apply: 'serve'` keeps it out of builds.
 */
function serveMswWorker(): Plugin {
  const workerPath = fileURLToPath(new URL(`./msw/${MSW_WORKER_FILE}`, import.meta.url));
  return {
    name: 'fleetconsole-serve-msw-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(`/${MSW_WORKER_FILE}`, (_req, res, next) => {
        readFile(workerPath).then(
          (body) => {
            res.setHeader('Content-Type', 'text/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(body);
          },
          next,
        );
      });
    },
  };
}

/** Mock mode is dev-server only: `vite build --mode mock` would ship MSW and the fixtures, so it is refused outright. */
function assertNotMockBuild(command: 'build' | 'serve', mode: string): void {
  if (command === 'build' && mode === MOCK_MODE) {
    throw new Error(
      'Vite mode "mock" is dev-server only (npm run dev:mock); mocks must never be built into dist/.',
    );
  }
}

export default defineConfig(({ command, mode }) => {
  assertNotMockBuild(command, mode);
  return {
    plugins:
      mode === MOCK_MODE
        ? [react(), mockLoginRedirect(), serveMswWorker()]
        : [react(), stripMonacoCdnDefault()],
    // `public/` (pre-paint theme script, favicon) is served in every mode and copied into `dist/`. The MSW worker
    // lives in `msw/` instead and is added only by `serveMswWorker` in mock mode, so it never lands in `dist/`.
    publicDir: 'public',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rolldownOptions: {
        output: {
          // Vite 8 / Rolldown replacement for Rollup's `manualChunks` (`advancedChunks` is deprecated).
          codeSplitting: { groups: vendorChunks },
          // Without this the `maxSize` parts of `vendor-patternfly` import each other in a cycle and the built SPA
          // crashed at startup (`D.modifiers` of PF's Table styles read before init; found by csp.e2e.ts, T-0104).
          // Rolldown then wraps modules so they run in source order across chunks.
          strictExecutionOrder: true,
        },
      },
    },
    server: {
      // Aspire passes the port to bind via PORT; otherwise Vite's default is used.
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      // No Api in mock mode: `/api` is answered by the MSW worker (and `mockLoginRedirect` for the login navigation).
      proxy:
        mode === MOCK_MODE
          ? undefined
          : {
              '/api': {
                target: apiTarget,
                changeOrigin: true,
                // Aspire's dev certificate is self-signed; only relevant for local development.
                secure: false,
                // Kubernetes exec/log streaming over WebSocket goes through /api too (later checkpoints).
                ws: true,
              },
            },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      // Vitest defaults to one worker per core, and each worker's V8 adds its own GC/compiler threads, so a run pegged
      // every core (~930% CPU on 10 cores). Measured on 10 cores: 4 workers with one V8 helper thread finish in the
      // same wall time (~80 s) at ~5 cores, leaving the machine usable. Override per run with `--maxWorkers=N`.
      maxWorkers: '40%',
      execArgv: ['--v8-pool-size=1'],
    },
  };
});
