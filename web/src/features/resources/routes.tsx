import type { RouteObject } from 'react-router';
import { ClusterLanding } from './ClusterLanding';
import { ResourcePageSkeleton } from './components/ResourcePageSkeleton';
import { NamespaceRedirect } from './NamespaceRedirect';
import type { DetailsTab } from './paths';
import type { ResourceRouteHandle } from './resourceRoute';

const listPage: Pick<RouteObject, 'lazy' | 'HydrateFallback'> = {
  lazy: () => import('./list/ResourceListPage').then((m) => ({ Component: m.ResourceListPage })),
  HydrateFallback: ResourcePageSkeleton,
};

const detailsPage: Pick<RouteObject, 'lazy' | 'HydrateFallback'> = {
  lazy: () => import('./ResourceDetailsPage').then((m) => ({ Component: m.ResourceDetailsPage })),
  HydrateFallback: ResourcePageSkeleton,
};

/** Details route at `path` plus its `yaml` / `events` tab children (handle `{ scope, tab }`). */
function detailsRoutes(path: string, scope: ResourceRouteHandle['scope']): RouteObject[] {
  const tabs: DetailsTab[] = ['yaml', 'events'];
  return [
    { path, handle: { scope } satisfies ResourceRouteHandle, ...detailsPage },
    ...tabs.map((tab) => ({
      path: `${path}/${tab}`,
      handle: { scope, tab } satisfies ResourceRouteHandle,
      ...detailsPage,
    })),
  ];
}

/**
 * Children of `c/:cluster` (ADR-0023 §1): the cluster landing, the namespace redirect, list pages per scope and
 * details pages with their tabs. Page modules load lazily (same convention as `features/admin/routes.tsx`);
 * `HydrateFallback` shows a page skeleton when the app starts on a resource URL. Each route's `handle` tells
 * `useResourceRoute` its scope (and tab). Details are a placeholder until T-0075.
 */
export const resourceRoutes: RouteObject[] = [
  { index: true, element: <ClusterLanding /> },
  { path: 'k8s/:plural', element: <NamespaceRedirect /> },
  { path: 'k8s/all-namespaces/:plural', handle: { scope: 'all' } satisfies ResourceRouteHandle, ...listPage },
  { path: 'k8s/ns/:namespace/:plural', handle: { scope: 'ns' } satisfies ResourceRouteHandle, ...listPage },
  { path: 'k8s/cluster/:plural', handle: { scope: 'cluster' } satisfies ResourceRouteHandle, ...listPage },
  ...detailsRoutes('k8s/ns/:namespace/:plural/:name', 'ns'),
  ...detailsRoutes('k8s/cluster/:plural/:name', 'cluster'),
];
