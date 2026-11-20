import type { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
// Same provider as the app: the `react-router/dom` one wires ReactDOM.flushSync, which the 401 handler relies on.
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/router';
import { createAppRuntime } from '@/app/session';

/** Result of the render helpers: RTL queries plus a `user-event` instance, the memory router and the QueryClient. */
export type RenderWithAppResult = RenderResult & {
  user: UserEvent;
  router: ReturnType<typeof createMemoryRouter>;
  queryClient: QueryClient;
};

/**
 * Mounts `routeObjects` in a memory router at `url` with the real providers and the app's session handling
 * (`createAppRuntime`: a 401 anywhere navigates to `/login`, exactly as in the app), without query retries.
 */
function renderRoutes(routeObjects: RouteObject[], url: string): RenderWithAppResult {
  const { router, queryClient } = createAppRuntime(
    () => createMemoryRouter(routeObjects, { initialEntries: [url] }),
    { retry: false },
  );
  const result = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, user: userEvent.setup(), router, queryClient };
}

/**
 * Renders the full application route table at `path`, signed in as the current mock persona (`setMockUser`, default
 * `admin`; `setMockUser(null)` = no session). Network calls go to the MSW server from `setup.ts`.
 */
export function renderApp(path: string): RenderWithAppResult {
  return renderRoutes(routes, path);
}

/**
 * Renders a single component with app providers and a memory router (for components that use router hooks).
 * `path` is the route pattern the element is mounted at; `url` is the initial location.
 */
export function renderWithProviders(
  ui: ReactElement,
  { path = '/', url = path }: { path?: string; url?: string } = {},
): RenderWithAppResult {
  return renderRoutes([{ path, element: ui }], url);
}
