import type { RouteObject } from 'react-router';
import { adminRoute } from '@/features/admin';
import { LoginPage, RequireSession } from '@/features/auth';
import { ClusterGate, LandingRedirect } from '@/features/cluster-context';
import { OverviewPage, SearchPage } from '@/features/home';
import { resourceRoutes } from '@/features/resources';
import { NotFoundPage } from '@/shared/ui';
import { AppShell } from './layout/AppShell';
import { RouteErrorPage } from './RouteErrorPage';

/**
 * Route table. The URL is the context: the active cluster is the `:cluster` segment (see FRONTEND.md "Routing").
 * Exported separately from the browser router so tests can mount it in a memory router.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    // Everything except /login needs a session (ADR-0014 §3); a 401 is handled globally by the QueryClient.
    element: <RequireSession />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          // Last used or first granted cluster; "No clusters assigned yet" without grants (SW-3/4).
          { index: true, element: <LandingRedirect /> },
          {
            // Only clusters in the user's list render; anything else is "not available" (SW-5).
            path: 'c/:cluster',
            element: <ClusterGate />,
            children: [
              // Landing, `k8s/...` lists and details (ADR-0023); page modules are lazy.
              ...resourceRoutes,
              // Unlisted placeholders until CP5.
              { path: 'overview', element: <OverviewPage /> },
              { path: 'search', element: <SearchPage /> },
            ],
          },
          // Admin pages are lazy route modules in their own chunks, gated by RequireAdmin (ADM-3).
          adminRoute,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
