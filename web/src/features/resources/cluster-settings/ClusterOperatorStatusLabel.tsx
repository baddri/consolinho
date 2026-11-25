import type { ClusterOperatorStatus } from '@/shared/health';
import { StatusIconText, type StatusKind } from '@/shared/ui';

/** OCP `cluster-operator.tsx` `getIcon`: the icon family of each operator status. */
const STATUS_ICONS: Readonly<Record<ClusterOperatorStatus, StatusKind>> = {
  Available: 'success',
  Progressing: 'progress',
  Degraded: 'warning',
  'Cannot update': 'warning',
  Unavailable: 'danger',
  Unknown: 'unknown',
};

/**
 * Sort order of the Status column, most urgent first (Degraded, Unavailable, Cannot update, Progressing, Unknown,
 * Available), like the fleet `HEALTH_SEVERITY`; OCP sorts the words alphabetically.
 */
export const CLUSTER_OPERATOR_STATUS_ORDER: readonly ClusterOperatorStatus[] = [
  'Degraded',
  'Unavailable',
  'Cannot update',
  'Progressing',
  'Unknown',
  'Available',
];

/** A ClusterOperator status as icon + label (OCP `OperatorStatusIconAndLabel`); also used by the cluster Overview. */
export function ClusterOperatorStatusLabel({ status }: { status: ClusterOperatorStatus }) {
  return <StatusIconText status={STATUS_ICONS[status]} text={status} />;
}
