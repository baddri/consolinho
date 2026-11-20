/// <reference types="vitest/config" />
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
  { name: 'vendor-patternfly', test: /node_modules[\\/]@patternfly[\\/]/ },
  {
    name: 'vendor-data',
    test: /node_modules[\\/](?:@tanstack|react-hook-form|@hookform|zod|openapi-fetch)[\\/]/,
  },
];

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
    plugins: mode === MOCK_MODE ? [react(), mockLoginRedirect()] : [react()],
    // The MSW worker script lives in `msw/` and is served only in mock mode, so it never lands in `dist/`. Mock mode
    // replaces `public/` rather than adding to it: if a `public/` directory is ever added, mock mode must serve both
    // (e.g. copy the worker in, or a small plugin serving `msw/`).
    publicDir: mode === MOCK_MODE ? 'msw' : 'public',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rolldownOptions: {
        output: {
          // Vite 8 / Rolldown replacement for Rollup's `manualChunks` (`advancedChunks` is deprecated).
          codeSplitting: { groups: vendorChunks },
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
    },
  };
});
