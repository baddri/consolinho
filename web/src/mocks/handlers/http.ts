import { HttpResponse } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';
import { CSRF_HEADER, type paths } from '@/shared/api';
import { currentMockUser, isAdmin } from '../db';
import { problem } from '../problem';

/**
 * MSW `http` typed with the generated API paths (ADR-0016): handlers are keyed by **path** (never by operation name,
 * which the Api may rename), and params, bodies and responses are checked against the Api's OpenAPI document. The `*` base URL makes them origin-agnostic (jsdom, the dev server and the browser worker alike).
 */
export const http = createOpenApiHttp<paths>({ baseUrl: '*' });

/** Endpoints that need no session (contract §4.3, §5; login/callback are full-page navigations, never mocked). */
const ANONYMOUS_PATHS = new Set(['/api/system/info', '/api/auth/logout']);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The mock's request pipeline, mirroring the Api's middleware order (contract §1, ADR-0012, ADR-0014): CSRF header
 * on non-GET → 403 `Auth.CsrfHeaderMissing` (before anything else); no session → 401 `Auth.Unauthenticated`;
 * non-admin on `/api/admin/**` → 403 `Auth.Forbidden`; read-only admin on an admin command (any non-GET, including
 * the connection tests) → 403 `Auth.ReadOnly`. When the request passes, the resolver returns nothing and MSW moves
 * on to the route handler.
 *
 * Registered first in `handlers/index.ts`; `server.use(...)` overrides in tests take precedence over it.
 */
export const accessGuard = http.untyped.all('*/api/*', ({ request }) => {
  const path = new URL(request.url).pathname;
  const isCommand = !SAFE_METHODS.has(request.method.toUpperCase());

  if (isCommand && request.headers.get(CSRF_HEADER) !== '1') {
    return problem(403, { code: 'Auth.CsrfHeaderMissing', detail: 'Missing CSRF header.' });
  }
  if (ANONYMOUS_PATHS.has(path)) return undefined;

  const user = currentMockUser();
  if (!user) {
    return problem(401, { code: 'Auth.Unauthenticated', detail: 'Authentication required.' });
  }
  if (path.startsWith('/api/admin/')) {
    if (!isAdmin(user)) {
      return problem(403, { code: 'Auth.Forbidden', detail: "You don't have access to Fleet administration." });
    }
    if (isCommand && user.isReadOnly) {
      return problem(403, { code: 'Auth.ReadOnly', detail: 'Your account is read-only.' });
    }
  }
  return undefined;
});

/**
 * Registered last. MSW counts a request as *handled* once any handler matched it — even {@link accessGuard}, which
 * only falls through — and would then send it to the real network instead of applying `onUnhandledFrame: 'error'`.
 * This handler restores "unknown routes fail" the same way that strategy does: it logs an error and answers with a
 * network error, so the `fetch` rejects (a thrown error would become a 500 that error-state tests could mistake for
 * a real response).
 */
export const unhandledApiRoute = http.untyped.all('*/api/*', ({ request }) => {
  console.error(
    `[mocks] No mock handler for ${request.method} ${new URL(request.url).pathname}. ` +
      'Add one to src/mocks/handlers or override it with server.use(...) in the test.',
  );
  return HttpResponse.error();
});
