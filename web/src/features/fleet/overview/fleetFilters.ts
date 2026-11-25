import type { ClusterDistribution, ClusterEnvironment } from '@/shared/api';
import { matchesText, type FilterDefs, type FilterOption, type FilterValues } from '@/shared/table';
import { clusterTypeText } from '@/shared/ui';
import type { FleetStatusKey, FleetTableRow } from './fleetTableRows';

const STATUSES: readonly FleetStatusKey[] = [
  'unreachable',
  'tokenInvalid',
  'degraded',
  'updating',
  'restricted',
  'healthy',
  'checking',
];
const ENVIRONMENTS: readonly ClusterEnvironment[] = ['production', 'staging', 'development'];
const DISTRIBUTIONS: readonly ClusterDistribution[] = ['openShift', 'kubernetes'];

/**
 * URL filters of `/fleet/overview` (FLT-5, `?q=&status=&env=&type=`): `q` searches name and display name; the others
 * are multi-selects, so `?status=degraded` deep-links to the degraded clusters (the summary line's links).
 */
export const FLEET_FILTERS = {
  q: { kind: 'text' },
  status: { kind: 'multi', values: STATUSES },
  env: { kind: 'multi', values: ENVIRONMENTS },
  type: { kind: 'multi', values: DISTRIBUTIONS },
} as const satisfies FilterDefs;

/** Current values of {@link FLEET_FILTERS}. */
export type FleetFilterValues = FilterValues<typeof FLEET_FILTERS>;

/** Status text per filter value, in severity order; the Status cell shows the same words. */
export const FLEET_STATUS_TEXT: Readonly<Record<FleetStatusKey, string>> = {
  unreachable: 'Unreachable',
  tokenInvalid: 'Token invalid',
  degraded: 'Degraded',
  updating: 'Updating',
  restricted: 'Restricted',
  healthy: 'Healthy',
  checking: 'Checking…',
};

/** Options of the Status filter ("Checking" without the ellipsis: it names a state, not an activity). */
export const STATUS_OPTIONS: FilterOption[] = STATUSES.map((value) => ({
  value,
  label: value === 'checking' ? 'Checking' : FLEET_STATUS_TEXT[value],
}));

/** Options of the Environment filter. */
export const ENVIRONMENT_OPTIONS: FilterOption[] = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

/** Options of the Type filter, worded like the Type column. */
export const TYPE_OPTIONS: FilterOption[] = DISTRIBUTIONS.map((value) => ({
  value,
  label: clusterTypeText(value).word,
}));

/** True when `row` passes every applied filter (an empty multi filter means "any"). */
export function matchesFleetFilters(row: FleetTableRow, filters: FleetFilterValues): boolean {
  const { cluster, statusKey } = row;
  return (
    matchesText(filters.q ?? '', cluster.name, cluster.displayName) &&
    (filters.status.length === 0 || (statusKey !== undefined && filters.status.includes(statusKey))) &&
    (filters.env.length === 0 || filters.env.includes(cluster.environment)) &&
    (filters.type.length === 0 || filters.type.includes(cluster.distribution))
  );
}
