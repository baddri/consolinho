/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

export default defineConfig({
  plugins: [react()],
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
    proxy: {
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
});
