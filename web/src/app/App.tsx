import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './providers';
import { routes } from './router';
import { createAppRuntime } from './session';

const { router, queryClient } = createAppRuntime(() => createBrowserRouter(routes));

/** Root component: providers around the browser router; a 401 anywhere leads to `/login` (ADR-0014 §2). */
export function App() {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
