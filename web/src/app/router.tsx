import { Navigate, type RouteObject } from 'react-router';
import { AdminPage } from '@/features/admin';
import { LoginPage, RequireSession } from '@/features/auth';
import { DEFAULT_CLUSTER } from '@/features/cluster-context';
import { OverviewPage, SearchPage } from '@/features/home';
import { ResourceDetailsPage, ResourceListPage } from '@/features/resources';
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
          {
            index: true,
            element: <Navigate to={`/c/${encodeURIComponent(DEFAULT_CLUSTER)}/overview`} replace />,
          },
          {
            path: 'c/:cluster',
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <OverviewPage /> },
              { path: 'search', element: <SearchPage /> },
              { path: 'ns/:namespace/:resource', element: <ResourceListPage /> },
              { path: 'ns/:namespace/:resource/:name', element: <ResourceDetailsPage /> },
              { path: 'cluster/:resource', element: <ResourceListPage /> },
              { path: 'cluster/:resource/:name', element: <ResourceDetailsPage /> },
            ],
          },
          {
            path: 'admin',
            children: [
              { index: true, element: <Navigate to="users" replace /> },
              { path: ':section', element: <AdminPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
