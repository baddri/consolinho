import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/app/queryClient';
import { routes } from '@/app/router';

/** Result of the render helpers: RTL queries plus a `user-event` instance and the memory router. */
export type RenderWithAppResult = RenderResult & {
  user: UserEvent;
  router: ReturnType<typeof createMemoryRouter>;
};

/**
 * Renders the full application route table at `path` with real providers (fresh QueryClient without retries, theme)
 * in a memory router. Network calls go to the MSW server from `setup.ts`.
 */
export function renderApp(path: string): RenderWithAppResult {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders queryClient={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, user: userEvent.setup(), router };
}

/**
 * Renders a single component with app providers and a memory router (for components that use router hooks).
 * `path` is the route pattern the element is mounted at; `url` is the initial location.
 */
export function renderWithProviders(
  ui: ReactElement,
  { path = '/', url = path }: { path?: string; url?: string } = {},
): RenderWithAppResult {
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const result = render(
    <AppProviders queryClient={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, user: userEvent.setup(), router };
}
