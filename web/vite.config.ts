/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Where the dev server forwards `/api` requests.
 *
 * Under `aspire run` the AppHost injects the Api's endpoints as environment variables following the
 * service-discovery convention `services__<resource>__<endpoint>__<index>` (here resource `api`). HTTPS is preferred
 * when present; outside Aspire we fall back to the Api's default Kestrel port.
 */
const apiTarget =
  process.env.services__api__https__0 ?? process.env.services__api__http__0 ?? 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
