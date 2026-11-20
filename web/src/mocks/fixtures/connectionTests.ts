import type {
  CapabilityCheckResult,
  CapabilityLevel,
  ConnectionTestResult,
  ConnectionTestStep,
  ConnectionTestStepResult,
} from '@/shared/api';
import type { ConnectionTestScenario } from './types';
import { minutesAgo } from './time';

/** The initial capability check set of ADR-0011 (contract §8.5), in order. */
const CHECKS: readonly Omit<CapabilityCheckResult, 'allowed'>[] = [
  { id: 'list-pods', label: 'List pods', category: 'read' },
  { id: 'list-deployments', label: 'List deployments', category: 'read' },
  { id: 'list-events', label: 'List events', category: 'read' },
  { id: 'get-pod-logs', label: 'Read pod logs', category: 'read' },
  { id: 'list-secrets', label: 'List secrets', category: 'read' },
  { id: 'list-nodes', label: 'List nodes', category: 'read' },
  { id: 'list-clusteroperators', label: 'List cluster operators', category: 'read' },
  { id: 'list-namespaces', label: 'List namespaces', category: 'read' },
  { id: 'patch-deployments', label: 'Patch deployments', category: 'write' },
  { id: 'delete-pods', label: 'Delete pods', category: 'write' },
  { id: 'create-pods-exec', label: 'Exec into pods', category: 'write' },
  { id: 'update-configmaps', label: 'Update config maps', category: 'write' },
];

/** Capability checks as a credential with the given headline would see them. */
function checksFor(level: CapabilityLevel): CapabilityCheckResult[] {
  return CHECKS.map((check) => ({
    ...check,
    allowed:
      level === 'clusterAdmin' ||
      (check.category === 'read' && check.id !== 'list-secrets') ||
      (level === 'clusterWideEdit' && check.category === 'write'),
  }));
}

const HEADLINE_MESSAGE: Record<CapabilityLevel, string> = {
  clusterAdmin: 'Cluster admin',
  clusterWideEdit: 'Cluster-wide edit',
  clusterWideView: 'Cluster-wide view',
  limited: 'Limited access',
};

const STEP_ORDER: readonly ConnectionTestStep[] = [
  'reachability',
  'authentication',
  'identity',
  'openShiftVersion',
  'capabilities',
];

const SKIPPED = 'Skipped because an earlier step failed';

/** The five steps where everything after `failed` is skipped. */
function stepsFailingAt(failed: ConnectionTestStepResult): ConnectionTestStepResult[] {
  const failedIndex = STEP_ORDER.indexOf(failed.step);
  return STEP_ORDER.map((step, index) => {
    if (index < failedIndex) {
      return { step, status: 'passed', message: 'Reachable, Kubernetes v1.31.4', failureKind: null };
    }
    if (index === failedIndex) return failed;
    return { step, status: 'skipped', message: SKIPPED, failureKind: null };
  });
}

/** A passing result for `serviceAccount` with the given capability headline. */
function passedResult(level: CapabilityLevel, serviceAccount: string): ConnectionTestResult {
  const canSeeVersion = level !== 'clusterWideView';
  return {
    succeeded: true,
    testedAt: minutesAgo(1),
    durationMs: 412,
    steps: [
      { step: 'reachability', status: 'passed', message: 'Reachable, Kubernetes v1.31.4', failureKind: null },
      { step: 'authentication', status: 'passed', message: 'Token accepted', failureKind: null },
      {
        step: 'identity',
        status: 'passed',
        message: `Authenticated as system:serviceaccount:${serviceAccount.replace('/', ':')}`,
        failureKind: null,
      },
      canSeeVersion
        ? { step: 'openShiftVersion', status: 'passed', message: 'OpenShift 4.18.12', failureKind: null }
        : {
            step: 'openShiftVersion',
            status: 'warning',
            message: 'Not visible with this credential',
            failureKind: 'forbidden',
          },
      { step: 'capabilities', status: 'passed', message: HEADLINE_MESSAGE[level], failureKind: null },
    ],
    kubernetesVersion: 'v1.31.4',
    identity: {
      username: `system:serviceaccount:${serviceAccount.replace('/', ':')}`,
      source: 'selfSubjectReview',
    },
    openShiftVersion: canSeeVersion ? { version: '4.18.12', updateProgressing: false } : null,
    capabilities: { headline: level, checks: checksFor(level) },
    namespaceRules: null,
    hints: [],
  };
}

/** Canned result: all steps pass, cluster-wide view (write checks denied, OpenShift version not visible). */
export const connectionTestPassed: ConnectionTestResult = passedResult(
  'clusterWideView',
  'fleetconsole/fleet-view',
);

/** Canned result: TLS failure at `reachability` (`tlsUnknownAuthority`); later steps skipped. */
export const connectionTestTlsFailure: ConnectionTestResult = {
  succeeded: false,
  testedAt: minutesAgo(1),
  durationMs: 87,
  steps: stepsFailingAt({
    step: 'reachability',
    status: 'failed',
    message: 'Certificate signed by unknown authority — add the cluster CA bundle',
    failureKind: 'tlsUnknownAuthority',
  }),
  kubernetesVersion: null,
  identity: null,
  openShiftVersion: null,
  capabilities: null,
  namespaceRules: null,
  hints: [],
};

/** Canned result: the cluster is reachable but rejects the token at `authentication`. */
export const connectionTestAuthFailure: ConnectionTestResult = {
  succeeded: false,
  testedAt: minutesAgo(1),
  durationMs: 154,
  steps: stepsFailingAt({
    step: 'authentication',
    status: 'failed',
    message: 'Token rejected by the cluster (expired, revoked, or for another cluster)',
    failureKind: 'unauthorized',
  }),
  kubernetesVersion: 'v1.31.4',
  identity: null,
  openShiftVersion: null,
  capabilities: null,
  namespaceRules: null,
  hints: [],
};

/** Canned result: cluster-wide edit plus the namespace rules of `payments` (inspectNamespace given). */
export const connectionTestWithNamespaceRules: ConnectionTestResult = {
  ...passedResult('clusterWideEdit', 'fleetconsole/fleet-edit'),
  namespaceRules: {
    namespace: 'payments',
    incomplete: false,
    evaluationError: null,
    rules: [
      {
        verbs: ['get', 'list', 'watch'],
        apiGroups: ['', 'apps'],
        resources: ['pods', 'pods/log', 'deployments', 'replicasets', 'events'],
        resourceNames: [],
      },
      {
        verbs: ['patch', 'update'],
        apiGroups: ['apps'],
        resources: ['deployments', 'deployments/scale'],
        resourceNames: [],
      },
      { verbs: ['create'], apiGroups: [''], resources: ['pods/exec'], resourceNames: [] },
    ],
  },
};

/**
 * Builds the result `POST …/test` returns for a credential's scenario. `inspectNamespace` adds namespace rules to a
 * passing result (renamed to the requested namespace); failing results never reach that step.
 */
export function connectionTestFor(
  scenario: ConnectionTestScenario,
  serviceAccount: string | null,
  inspectNamespace: string | null,
): ConnectionTestResult {
  const sa = serviceAccount ?? 'fleetconsole/unknown';
  const base: Record<ConnectionTestScenario, () => ConnectionTestResult> = {
    view: () => passedResult('clusterWideView', sa),
    edit: () => passedResult('clusterWideEdit', sa),
    admin: () => passedResult('clusterAdmin', sa),
    tlsFailure: () => connectionTestTlsFailure,
    authFailure: () => connectionTestAuthFailure,
  };
  const result = { ...base[scenario](), testedAt: new Date().toISOString() };
  if (inspectNamespace !== null && result.succeeded && connectionTestWithNamespaceRules.namespaceRules) {
    result.namespaceRules = {
      ...connectionTestWithNamespaceRules.namespaceRules,
      namespace: inspectNamespace,
    };
  }
  return result;
}
