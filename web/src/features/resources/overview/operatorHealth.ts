import { clusterOperatorStatus, type ClusterOperatorStatus } from '@/shared/health';
import type { ClusterOperator } from '@/shared/k8s';
import type { HealthState } from './HealthItem';

/**
 * Health state of one ClusterOperator status, as OCP `getClusterOperatorStatusPriority` (Degraded → warning,
 * Progressing → updating, Unknown → unknown) plus `Unavailable` → error (the shared vocabulary has that status).
 */
const CO_HEALTH: Record<ClusterOperatorStatus, HealthState> = {
  Unavailable: 'error',
  Degraded: 'warning',
  Progressing: 'updating',
  Unknown: 'unknown',
  'Cannot update': 'ok',
  Available: 'ok',
};

/** OCP `healthStateMapping` priorities: the worst state of a group wins. */
const PRIORITY: Record<HealthState, number> = {
  ok: 0,
  loading: 0,
  notAvailable: 0,
  unknown: 1,
  updating: 3,
  warning: 5,
  error: 6,
};

/** A ClusterOperator with its shared status word and the health state it shows as. */
export interface OperatorHealth {
  operator: ClusterOperator;
  status: ClusterOperatorStatus;
  health: HealthState;
}

/** Every operator with its health, not-OK ones first (worst first), then by name (popover order). */
export function operatorHealths(operators: readonly ClusterOperator[]): OperatorHealth[] {
  return operators
    .map((operator) => {
      const status = clusterOperatorStatus(operator);
      return { operator, status, health: CO_HEALTH[status] };
    })
    .sort(
      (a, b) =>
        PRIORITY[b.health] - PRIORITY[a.health] ||
        (a.operator.metadata.name ?? '').localeCompare(b.operator.metadata.name ?? ''),
    );
}

/**
 * The Operators health item state and secondary text (OCP `getOperatorsHealthState`): the worst state, and its count
 * ("2 degraded", "1 updating"); error and warning operators are counted together as degraded.
 */
export function operatorsHealthSummary(healths: readonly OperatorHealth[]): { state: HealthState; detail?: string } {
  const worst = healths[0]?.health ?? 'ok';
  if (worst === 'ok') return { state: 'ok' };
  const degraded = worst === 'error' || worst === 'warning';
  const count = healths.filter((h) =>
    degraded ? h.health === 'error' || h.health === 'warning' : h.health === worst,
  ).length;
  const word = degraded ? 'degraded' : worst === 'updating' ? 'updating' : 'unknown';
  return { state: worst, detail: `${count} ${word}` };
}
