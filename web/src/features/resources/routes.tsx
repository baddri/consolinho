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
  lazy: () => import('./details/ResourceDetailsPage').then((m) => ({ Component: m.ResourceDetailsPage })),
  HydrateFallback: ResourcePageSkeleton,
};

/** Lazy panel module per details tab; YAML stays its own module so Monaco (ADR-0024) loads only there. */
const detailsTabs: Record<'details' | DetailsTab, RouteObject['lazy']> = {
  details: () => import('./details/ResourceDetailsTab').then((m) => ({ Component: m.ResourceDetailsTab })),
  yaml: () => import('./yaml/ResourceYamlTab').then((m) => ({ Component: m.ResourceYamlTab })),
  pods: () => import('./details/ResourcePodsTab').then((m) => ({ Component: m.ResourcePodsTab })),
  events: () => import('./events/ResourceEventsTab').then((m) => ({ Component: m.ResourceEventsTab })),
};

/**
 * Details layout at `path` (header + tab bar) with one child per tab: the index (Details), `yaml`, `pods` (kinds with
 * a `podsSelector`) and `events`. The
 * children's handle `{ scope, tab }` tells `useResourceRoute` / `useResourceTab` the scope and tab.
 */
function detailsRoutes(path: string, scope: ResourceRouteHandle['scope']): RouteObject[] {
  const tabs: DetailsTab[] = ['yaml', 'pods', 'events'];
  return [
    {
      path,
      ...detailsPage,
      children: [
        { index: true, handle: { scope } satisfies ResourceRouteHandle, lazy: detailsTabs.details },
        ...tabs.map((tab) => ({
          path: tab,
          handle: { scope, tab } satisfies ResourceRouteHandle,
          lazy: detailsTabs[tab],
        })),
      ],
    },
  ];
}

/**
 * Children of `c/:cluster` (ADR-0023 §1): the cluster landing, the namespace redirect, list pages per scope and
 * details pages with their tabs. Page modules load lazily (same convention as `features/admin/routes.tsx`);
 * `HydrateFallback` shows a page skeleton when the app starts on a resource URL. Each route's `handle` tells
 * `useResourceRoute` its scope (and tab).
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
