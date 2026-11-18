import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from './queryClient';
import { AppProviders } from './providers';
import { routes } from './router';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

/** Root component: providers around the browser router. */
export function App() {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
