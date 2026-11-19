import { Navigate, type RouteObject } from 'react-router';
import { NotFoundPage } from '@/shared/ui';
import type { AdminTabHandle, ClusterDetailTab, UserDetailTab } from './adminTabs';
import { AdminPageSpinner } from './AdminPageSpinner';
import { RequireAdmin } from './RequireAdmin';

/** Route `handle` selecting a detail page tab (read by `useAdminTab`). */
const tab = (id: UserDetailTab | ClusterDetailTab): AdminTabHandle => ({ tab: id });

/**
 * Every admin route (FRONTEND.md "Routing"), mounted by the app under the shell at `/admin`.
 *
 * **Code splitting convention:** each page is a separate module that exports a named component, loaded with React
 * Router's `lazy` as `lazy: () => import('./area/XPage').then((m) => ({ Component: m.XPage }))`. Keep the import
 * path a string literal (the bundler needs it to emit a chunk) and never import a page module statically from
 * outside this file, or its code moves back into the entry chunk. Several routes may share a module (detail tabs,
 * create/edit form); the module is fetched once.
 *
 * - `RequireAdmin` gates the whole area (ADM-3); unknown admin paths render the 404 page (for admins).
 * - Detail tabs are URL segments; `handle: tab('…')` names the tab, the index route is `details`.
 * - `HydrateFallback` shows a spinner when the app starts on an admin URL and the page chunk is still loading. On
 *   in-app navigation React Router keeps the current page until the next chunk has loaded.
 */
export const adminRoute: RouteObject = {
  path: 'admin',
  element: <RequireAdmin />,
  HydrateFallback: AdminPageSpinner,
  children: [
    { index: true, element: <Navigate to="users" replace /> },
    {
      path: 'users',
      lazy: () => import('./users/UsersListPage').then((m) => ({ Component: m.UsersListPage })),
    },
    {
      path: 'users/:username',
      lazy: () => import('./users/UserDetailPage').then((m) => ({ Component: m.UserDetailPage })),
    },
    {
      path: 'users/:username/access',
      handle: tab('access'),
      lazy: () => import('./users/UserDetailPage').then((m) => ({ Component: m.UserDetailPage })),
    },
    {
      path: 'clusters',
      lazy: () => import('./clusters/ClustersListPage').then((m) => ({ Component: m.ClustersListPage })),
    },
    {
      path: 'clusters/new',
      lazy: () => import('./clusters/ClusterFormPage').then((m) => ({ Component: m.ClusterFormPage })),
    },
    {
      path: 'clusters/:name/edit',
      lazy: () => import('./clusters/ClusterFormPage').then((m) => ({ Component: m.ClusterFormPage })),
    },
    {
      path: 'clusters/:name',
      lazy: () => import('./clusters/ClusterDetailPage').then((m) => ({ Component: m.ClusterDetailPage })),
    },
    {
      path: 'clusters/:name/credentials',
      handle: tab('credentials'),
      lazy: () => import('./clusters/ClusterDetailPage').then((m) => ({ Component: m.ClusterDetailPage })),
    },
    {
      path: 'clusters/:name/access',
      handle: tab('access'),
      lazy: () => import('./clusters/ClusterDetailPage').then((m) => ({ Component: m.ClusterDetailPage })),
    },
    {
      path: 'credentials',
      lazy: () =>
        import('./credentials/CredentialsListPage').then((m) => ({ Component: m.CredentialsListPage })),
    },
    {
      path: 'audit',
      lazy: () => import('./audit/AuditLogPage').then((m) => ({ Component: m.AuditLogPage })),
    },
    { path: '*', element: <NotFoundPage /> },
  ],
};
