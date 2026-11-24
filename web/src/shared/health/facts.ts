import {
  ApiError,
  type FleetClusterOperators,
  type FleetClusterVersion,
  type FleetNodes,
  type FleetProbeOutcome,
} from '@/shared/api';
import type { ClusterOperator, ClusterVersion, K8sCondition, Node } from '@/shared/k8s';

/*
 * Raw objects → the facts of a fleet status line (CP5 contract §2), so the cluster Overview (OVW-3) feeds the very
 * same `clusterHealth` as the Fleet overview. Each `*Facts` function takes the read's data and error: a 403 gives
 * `forbidden`, a 404 `notFound` (counts null, as the server does); while loading or after another error it returns
 * `null` (= not probed), so a transient failure never turns into a health verdict.
 */

/** Outcome of a failed read: `forbidden` (403), `notFound` (404), or `undefined` for any other error. */
export function probeOutcome(error: unknown): FleetProbeOutcome | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'notFound';
  return undefined;
}

/** The section to report for a read without data: an outcome-only section for 403/404, else `null`. */
function failedSection<S>(error: unknown, empty: (outcome: FleetProbeOutcome) => S): S | null {
  const outcome = probeOutcome(error);
  return outcome === undefined ? null : empty(outcome);
}

/** `true`/`false` from a condition's status (`True` vs anything else); `null` when the condition is absent. */
function conditionIs(conditions: K8sCondition[] | undefined, type: string): boolean | null {
  const condition = conditions?.find((c) => c.type === type);
  return condition === undefined ? null : condition.status === 'True';
}

/** Whether `conditions` has `type` with exactly `status`. */
function hasCondition(
  conditions: K8sCondition[] | undefined,
  type: string,
  status: K8sCondition['status'],
): boolean {
  return conditions?.some((c) => c.type === type && c.status === status) ?? false;
}

/**
 * The version a cluster runs: the newest `Completed` history entry (history is newest first, OCP
 * `getLastCompletedUpdate`), else the desired version (first install still running).
 */
export function clusterCurrentVersion(cv: ClusterVersion): string | null {
  const completed = cv.status?.history?.find((entry) => entry.state === 'Completed');
  return completed?.version ?? cv.status?.desired?.version ?? null;
}

/** ClusterVersion `version` → {@link FleetClusterVersion}. */
export function clusterVersionFacts(
  cv: ClusterVersion | undefined,
  error?: unknown,
): FleetClusterVersion | null {
  if (cv === undefined) {
    return failedSection(error, (outcome) => ({
      outcome,
      currentVersion: null,
      desiredVersion: null,
      available: null,
      progressing: null,
      failing: null,
      availableUpdates: null,
    }));
  }
  const conditions = cv.status?.conditions;
  return {
    outcome: 'ok',
    currentVersion: clusterCurrentVersion(cv),
    desiredVersion: cv.status?.desired?.version ?? null,
    available: conditionIs(conditions, 'Available'),
    progressing: conditionIs(conditions, 'Progressing'),
    failing: conditionIs(conditions, 'Failing'),
    availableUpdates: cv.status?.availableUpdates?.length ?? 0,
  };
}

/** ClusterOperator list → {@link FleetClusterOperators} counts. */
export function clusterOperatorFacts(
  operators: ClusterOperator[] | undefined,
  error?: unknown,
): FleetClusterOperators | null {
  if (operators === undefined) {
    return failedSection(error, (outcome) => ({
      outcome,
      total: null,
      degraded: null,
      unavailable: null,
      progressing: null,
    }));
  }
  const count = (test: (co: ClusterOperator) => boolean) => operators.filter(test).length;
  return {
    outcome: 'ok',
    total: operators.length,
    degraded: count((co) => hasCondition(co.status?.conditions, 'Degraded', 'True')),
    unavailable: count((co) => !hasCondition(co.status?.conditions, 'Available', 'True')),
    progressing: count((co) => hasCondition(co.status?.conditions, 'Progressing', 'True')),
  };
}

/** Node list → {@link FleetNodes} counts (`notReady` = total − ready, i.e. Ready False or Unknown). */
export function nodeFacts(nodes: Node[] | undefined, error?: unknown): FleetNodes | null {
  if (nodes === undefined) {
    return failedSection(error, (outcome) => ({
      outcome,
      total: null,
      ready: null,
      notReady: null,
      unschedulable: null,
    }));
  }
  const ready = nodes.filter((node) => nodeReadiness(node) === 'Ready').length;
  return {
    outcome: 'ok',
    total: nodes.length,
    ready,
    notReady: nodes.length - ready,
    unschedulable: nodes.filter(isUnschedulable).length,
  };
}

/** A node's Ready condition: True → `Ready`, False → `NotReady`, Unknown or missing → `Unknown`. */
export function nodeReadiness(node: Node): 'Ready' | 'NotReady' | 'Unknown' {
  const status = node.status?.conditions?.find((c) => c.type === 'Ready')?.status;
  if (status === 'True') return 'Ready';
  if (status === 'False') return 'NotReady';
  return 'Unknown';
}

/** Whether a node is cordoned (`spec.unschedulable`, Table "SchedulingDisabled"). */
export function isUnschedulable(node: Node): boolean {
  return node.spec?.unschedulable ?? false;
}

/** A ClusterOperator's status, as OCP `OperatorStatus` (`public/module/k8s/cluster-operator.ts`). */
export type ClusterOperatorStatus =
  'Available' | 'Progressing' | 'Degraded' | 'Cannot update' | 'Unavailable' | 'Unknown';

/**
 * A ClusterOperator's status in OCP `getStatusAndMessage` order: Upgradeable False → `Cannot update`, Available
 * False → `Unavailable`, Degraded True, Progressing True, Available True, else `Unknown`. `message` is the deciding
 * condition's message (none for Available/Unknown).
 */
export function clusterOperatorStatusAndMessage(co: ClusterOperator): {
  status: ClusterOperatorStatus;
  message?: string;
} {
  const conditions = co.status?.conditions ?? [];
  const rules: [string, K8sCondition['status'], ClusterOperatorStatus][] = [
    ['Upgradeable', 'False', 'Cannot update'],
    ['Available', 'False', 'Unavailable'],
    ['Degraded', 'True', 'Degraded'],
    ['Progressing', 'True', 'Progressing'],
  ];
  for (const [type, status, result] of rules) {
    const condition = conditions.find((c) => c.type === type && c.status === status);
    if (condition)
      return condition.message === undefined
        ? { status: result }
        : { status: result, message: condition.message };
  }
  return { status: hasCondition(conditions, 'Available', 'True') ? 'Available' : 'Unknown' };
}

/** The status column of a ClusterOperator ({@link clusterOperatorStatusAndMessage} without the message). */
export function clusterOperatorStatus(co: ClusterOperator): ClusterOperatorStatus {
  return clusterOperatorStatusAndMessage(co).status;
}

/** The operator's own version (`status.versions` entry `operator`, OCP `getClusterOperatorVersion`). */
export function clusterOperatorVersion(co: ClusterOperator): string | undefined {
  return co.status?.versions?.find((v) => v.name === 'operator')?.version;
}
