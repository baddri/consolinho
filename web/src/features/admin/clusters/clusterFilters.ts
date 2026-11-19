import type { ClusterEnvironment, ClusterListItem } from '@/shared/api';
import { matchesText, type FilterDefs, type FilterOption, type FilterValues } from '@/shared/table';

const ENVIRONMENTS: readonly ClusterEnvironment[] = ['production', 'staging', 'development'];
const STATUSES = ['enabled', 'disabled'] as const;

/**
 * URL filters of `/admin/clusters` (`?q=&env=&status=`): `q` searches name, display name and API URL; `env` and
 * `status` are multi-selects, so `?env=production` deep-links to the production clusters.
 */
export const CLUSTER_FILTERS = {
  q: { kind: 'text' },
  env: { kind: 'multi', values: ENVIRONMENTS },
  status: { kind: 'multi', values: STATUSES },
} as const satisfies FilterDefs;

/** Current values of {@link CLUSTER_FILTERS}. */
export type ClusterFilterValues = FilterValues<typeof CLUSTER_FILTERS>;

/** Options of the environment filter. */
export const ENVIRONMENT_OPTIONS: FilterOption[] = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

/** Options of the status filter, labelled like `ClusterStatusLabel`. */
export const CLUSTER_STATUS_OPTIONS: FilterOption[] = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

/** True when `cluster` passes every applied filter (an empty multi filter means "any"). */
export function matchesClusterFilters(cluster: ClusterListItem, filters: ClusterFilterValues): boolean {
  const status = cluster.isEnabled ? 'enabled' : 'disabled';
  return (
    matchesText(filters.q ?? '', cluster.name, cluster.displayName, cluster.apiUrl) &&
    (filters.env.length === 0 || filters.env.includes(cluster.environment)) &&
    (filters.status.length === 0 || filters.status.includes(status))
  );
}
