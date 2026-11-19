import type { RouteObject } from 'react-router';

/**
 * Allowance for the **first** full-app render of a test file, passed as `{ timeout }` to that test's first `findBy*`.
 *
 * Every test file runs in a fresh module graph, so its first `renderApp` pays a cold start that later tests do not:
 * the first React/PatternFly render of the shell, MSW's first intercepted requests (`GET /api/auth/me`,
 * `GET /api/clusters`) and the landing redirect. Idle this takes ~300 ms; with two suites running at once it was seen
 * above 3 s, past the global `asyncUtilTimeout` (T-0046). Use it only on that one wait — never as a global timeout —
 * and give the test a {@link COLD_START_TEST_TIMEOUT_MS} so Vitest does not abort it first.
 */
export const COLD_START_TIMEOUT_MS = 10_000;

/** Vitest timeout for a test that uses {@link COLD_START_TIMEOUT_MS}: the wait plus headroom for its assertions. */
export const COLD_START_TEST_TIMEOUT_MS = COLD_START_TIMEOUT_MS + 5_000;

/**
 * Imports every lazily loaded route module in `routes` (React Router `lazy`, function or per-property object form),
 * so tests that navigate to those routes do not pay the module's first transform and import inside a `findBy*` wait.
 * Call it from `beforeAll` (hook timeout 10 s); the module cache keeps the modules loaded for the rest of the file.
 * Walking the route table instead of importing page modules by path keeps it in step with the router.
 */
export async function preloadLazyRoutes(routes: readonly RouteObject[]): Promise<void> {
  const loads: Promise<unknown>[] = [];
  const visit = (route: RouteObject): void => {
    const { lazy } = route;
    if (typeof lazy === 'function') {
      loads.push(lazy());
    } else if (lazy) {
      for (const load of Object.values(lazy)) {
        if (typeof load === 'function') loads.push(load());
      }
    }
    route.children?.forEach(visit);
  };
  routes.forEach(visit);
  await Promise.all(loads);
}
