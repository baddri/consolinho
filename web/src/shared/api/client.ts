import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

/** Header every state-changing `/api` request must carry (CSRF defence, see docs/architecture/SECURITY.md). */
export const CSRF_HEADER = 'X-Console-Request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Adds {@link CSRF_HEADER} to state-changing (non-GET/HEAD/OPTIONS) requests. The backend rejects them without it;
 * because it is a custom header, a cross-site page cannot send it without a CORS preflight the Api never approves.
 */
export function withCsrfHeader(request: Request): Request {
  if (!SAFE_METHODS.has(request.method.toUpperCase())) {
    request.headers.set(CSRF_HEADER, '1');
  }
  return request;
}

/** openapi-fetch middleware applying {@link withCsrfHeader} to every request of {@link apiClient}. */
export const csrfMiddleware: Middleware = {
  onRequest: ({ request }) => withCsrfHeader(request),
};

/**
 * Typed client for the FleetConsole Api. Its types are the {@link paths} generated from the Api's OpenAPI document
 * (`npm run gen:api`, ADR-0016). Hooks call it through `unwrap()` / `unwrapNoContent()` so failures are always an
 * `ApiError` (ADR-0015).
 *
 * The base URL is the SPA's own origin rather than `/api`: the Api's OpenAPI document lists full routes
 * (`/api/system/info`), so paths passed to the client already start with `/api`. In development Vite proxies `/api`
 * to the Api; in production the Api serves the SPA itself, so requests are always same-origin and carry the
 * session cookie.
 *
 * `fetch` is resolved at call time (not captured when the module loads) so test interceptors such as MSW, which
 * patch `globalThis.fetch` after import, still see every request.
 */
export const apiClient = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  fetch: (request) => globalThis.fetch(request),
});

apiClient.use(csrfMiddleware);
