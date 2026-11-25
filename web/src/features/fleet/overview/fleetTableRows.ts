import {
  clusterHealth,
  HEALTH_SEVERITY,
  type ClusterHealth,
  type ClusterHealthStatus,
} from '@/shared/health';
import type { FleetRow } from '../api/useFleetRows';

/** Value of the Status filter: a health status, or `checking` for a row whose line has not arrived yet. */
export type FleetStatusKey = ClusterHealthStatus | 'checking';

/** A fleet row with its health worked out once, for the cells, the sort, the filters and the summary. */
export interface FleetTableRow extends FleetRow {
  /** `clusterHealth` of the line; absent while pending or after a failed first fetch. */
  health?: ClusterHealth;
  /** Status filter value; absent for a row that is neither checked nor checking (the stream failed). */
  statusKey?: FleetStatusKey;
}

/** Rank of a pending row: after every health status (FLT-5, "pending last"). */
const PENDING_RANK = Object.keys(HEALTH_SEVERITY).length;

/** Adds {@link FleetTableRow.health} and {@link FleetTableRow.statusKey} to each row. */
export function toTableRows(rows: readonly FleetRow[]): FleetTableRow[] {
  return rows.map((row) => {
    if (!row.status) return { ...row, statusKey: row.pending ? 'checking' : undefined };
    const health = clusterHealth(row.status);
    return { ...row, health, statusKey: health.status };
  });
}

/**
 * Sort value of the Status column, which is also the page's default sort (FLT-5): severity (worst first, pending and
 * unknown last), then display name. One string, compared with numeric collation by `useClientSort`.
 */
export function statusSortValue(row: FleetTableRow): string {
  const rank = row.health ? HEALTH_SEVERITY[row.health.status] : PENDING_RANK;
  return `${String(rank)} ${row.cluster.displayName}`;
}
