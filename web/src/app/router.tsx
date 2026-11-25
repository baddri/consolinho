import type { RouteObject } from 'react-router';
import { RedirectKeepingQuery } from '@/shared/routing';
import { adminRoute, legacyAdminRoute } from '@/features/admin';
import { LoginPage, RequireSession } from '@/features/auth';
import { ClusterGate, LandingRedirect } from '@/features/cluster-context';
import { fleetRoute } from '@/features/fleet';
import { preferencesRoute } from '@/features/preferences';
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
              // Landing, Overview, `k8s/...` lists and details (ADR-0023); page modules are lazy.
              ...resourceRoutes,
            ],
          },
          {
            // Fleet perspective (ADR-0033 §1): `/fleet` lands on the overview, open to everyone (FLT-1, Q10); admin
            // pages are lazy route modules in their own chunks, gated by RequireAdmin (ADM-3) at `/fleet/admin/*`.
            path: 'fleet',
            children: [
              { index: true, element: <RedirectKeepingQuery to="overview" /> },
              fleetRoute,
              adminRoute,
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          // Pre-CP3.7 `/admin/...` URLs (bookmarks, login returnUrls) → `/fleet/admin/...` (ADR-0033 §2).
          legacyAdminRoute,
          // Colour scheme and contrast (OCP User preferences); browser-local, not cluster-scoped.
          preferencesRoute,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
