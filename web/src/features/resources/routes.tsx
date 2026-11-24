import type { RouteObject } from 'react-router';
import { ClusterLanding } from './ClusterLanding';
import { ResourcePageSkeleton } from './components/ResourcePageSkeleton';
import { NamespaceRedirect } from './NamespaceRedirect';
import { SearchRedirect } from './search/SearchRedirect';
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

/** Edit Deployment (FORM-1): a full page of its own, not a details tab. */
const editDeploymentPage: Pick<RouteObject, 'lazy' | 'HydrateFallback'> = {
  lazy: () =>
    import('./workloads/deployments/form/EditDeploymentPage').then((m) => ({ Component: m.EditDeploymentPage })),
  HydrateFallback: ResourcePageSkeleton,
};

const searchPage: Pick<RouteObject, 'lazy' | 'HydrateFallback'> = {
  lazy: () => import('./search/SearchPage').then((m) => ({ Component: m.SearchPage })),
  HydrateFallback: ResourcePageSkeleton,
};

/** The descriptor-owned kind tabs (`KindTabs`): one module rendering the descriptor's component for the tab. */
const kindTab: RouteObject['lazy'] = () =>
  import('./details/ResourceDetailsPage').then((m) => ({ Component: m.ResourceKindTab }));

/** Lazy panel module per details tab; YAML stays its own module so Monaco (ADR-0024) loads only there. */
const detailsTabs: Record<'details' | DetailsTab, RouteObject['lazy']> = {
  details: () => import('./details/ResourceDetailsTab').then((m) => ({ Component: m.ResourceDetailsTab })),
  yaml: () => import('./yaml/ResourceYamlTab').then((m) => ({ Component: m.ResourceYamlTab })),
  pods: () => import('./details/ResourcePodsTab').then((m) => ({ Component: m.ResourcePodsTab })),
  events: () => import('./events/ResourceEventsTab').then((m) => ({ Component: m.ResourceEventsTab })),
  // Kind tabs (ADR-0037 §1-2): only reachable for descriptors listing them in `extraTabs` (`hasTab` redirects).
  replicasets: () =>
    import('./workloads/replicasets/DeploymentReplicaSetsTab').then((m) => ({
      Component: m.DeploymentReplicaSetsTab,
    })),
  replicationcontrollers: () =>
    import('./workloads/deploymentconfigs/DeploymentConfigRCsTab').then((m) => ({
      Component: m.DeploymentConfigRCsTab,
    })),
  machines: kindTab,
  subscription: kindTab,
  'related-objects': kindTab,
  jobs: () => import('./workloads/cronjobs/CronJobJobsTab').then((m) => ({ Component: m.CronJobJobsTab })),
  logs: () => import('./workloads/logs/PodLogsTab').then((m) => ({ Component: m.PodLogsTab })),
  terminal: () =>
    import('./workloads/terminal/PodTerminalTab').then((m) => ({ Component: m.PodTerminalTab })),
};

/**
 * Details layout at `path` (header + tab bar) with one child per tab: the index (Details), `yaml`, `pods` (kinds with
 * a `podsSelector`), `events` and the kind tabs `replicasets`, `replicationcontrollers`, `machines`, `subscription`,
 * `related-objects`, `jobs`, `logs`, `terminal` (descriptor `extraTabs`). The children's handle `{ scope, tab }`
 * tells `useResourceRoute` / `useResourceTab` the scope and tab.
 */
function detailsRoutes(path: string, scope: ResourceRouteHandle['scope']): RouteObject[] {
  const tabs: DetailsTab[] = [
    'yaml',
    'replicasets',
    'replicationcontrollers',
    'machines',
    'subscription',
    'related-objects',
    'pods',
    'jobs',
    'logs',
    'events',
    'terminal',
  ];
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
 * Children of `c/:cluster` (ADR-0023 §1): the cluster landing, the namespace redirect, list pages per scope,
 * details pages with their tabs and the Search page. Page modules load lazily (same convention as `features/admin/routes.tsx`);
 * `HydrateFallback` shows a page skeleton when the app starts on a resource URL. Each route's `handle` tells
 * `useResourceRoute` its scope (and tab).
 */
export const resourceRoutes: RouteObject[] = [
  { index: true, element: <ClusterLanding /> },
  { path: 'k8s/:plural', element: <NamespaceRedirect /> },
  { path: 'k8s/all-namespaces/:plural', handle: { scope: 'all' } satisfies ResourceRouteHandle, ...listPage },
  { path: 'k8s/ns/:namespace/:plural', handle: { scope: 'ns' } satisfies ResourceRouteHandle, ...listPage },
  { path: 'k8s/cluster/:plural', handle: { scope: 'cluster' } satisfies ResourceRouteHandle, ...listPage },
  // A static `deployments` segment outranks `:plural`, so this wins over a details tab named `form`.
  {
    path: 'k8s/ns/:namespace/deployments/:name/form',
    handle: { scope: 'ns' } satisfies ResourceRouteHandle,
    ...editDeploymentPage,
  },
  ...detailsRoutes('k8s/ns/:namespace/:plural/:name', 'ns'),
  ...detailsRoutes('k8s/cluster/:plural/:name', 'cluster'),
  // Home → Search (SRCH-1): `search` picks the last project like `k8s/:plural`.
  { path: 'search', element: <SearchRedirect /> },
  { path: 'search/ns/:namespace', ...searchPage },
  { path: 'search/all-namespaces', ...searchPage },
];
