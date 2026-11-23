import type {
  CapabilityCheckResult,
  CapabilityLevel,
  ClusterDistribution,
  ConnectionTestResult,
  ConnectionTestStep,
  ConnectionTestStepResult,
  NamespaceRules,
  ResourceRule,
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
  'distribution',
  'openShiftVersion',
  'capabilities',
];

const SKIPPED = 'Skipped because an earlier step failed';

/** What the mock knows about the tested cluster and request (DIST-7/8, NST-3). */
export interface ConnectionTestContext {
  /** The cluster's declared distribution (DIST-1). */
  declared: ClusterDistribution;
  /** Whether the mock API server serves OpenShift groups there (`k8s/fixtures.ts:servesProjects`). */
  servesOpenShift: boolean;
  /** The normalised namespaces to inspect, in order. */
  inspectNamespaces: readonly string[];
}

/** A plain OpenShift cluster with nothing to inspect: the canned results below. */
const OPENSHIFT_CONTEXT: ConnectionTestContext = {
  declared: 'openShift',
  servesOpenShift: true,
  inspectNamespaces: [],
};

/** The six steps where everything after `failed` is skipped; nothing detected about the distribution. */
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

/** The `distribution` step (DIST-7): passed when discovery agrees with the declaration, a warning otherwise. */
function distributionStep({ declared, servesOpenShift }: ConnectionTestContext): ConnectionTestStepResult {
  const detected: ClusterDistribution = servesOpenShift ? 'openShift' : 'kubernetes';
  if (detected === declared) {
    const message = servesOpenShift ? 'OpenShift APIs served, as registered' : 'No OpenShift APIs served, as registered';
    return { step: 'distribution', status: 'passed', message, failureKind: null };
  }
  const message = servesOpenShift
    ? 'The cluster serves OpenShift APIs but is registered as Kubernetes. Check the distribution.'
    : 'The cluster does not serve OpenShift APIs but is registered as OpenShift. Check the distribution.';
  return { step: 'distribution', status: 'warning', message, failureKind: null };
}

/** The `openShiftVersion` step: skipped on a declared and detected Kubernetes cluster (DIST-8). */
function openShiftVersionStep(context: ConnectionTestContext, canSeeVersion: boolean): ConnectionTestStepResult {
  if (context.declared === 'kubernetes' && !context.servesOpenShift) {
    return { step: 'openShiftVersion', status: 'skipped', message: 'Not an OpenShift cluster', failureKind: null };
  }
  if (canSeeVersion && context.servesOpenShift) {
    return { step: 'openShiftVersion', status: 'passed', message: 'OpenShift 4.18.12', failureKind: null };
  }
  return {
    step: 'openShiftVersion',
    status: 'warning',
    message: 'Not visible with this credential',
    failureKind: context.servesOpenShift ? 'forbidden' : 'notFound',
  };
}

/** The rules a cluster-wide edit credential has in an inspected namespace. */
const NAMESPACE_RULES: readonly ResourceRule[] = [
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
];

/** One inspected namespace: names starting with `forbidden` fail with a 403 (partial failure, NST-3). */
function namespaceRulesFor(namespace: string): NamespaceRules {
  if (namespace.startsWith('forbidden')) {
    return {
      namespace,
      incomplete: false,
      evaluationError: null,
      rules: null,
      error: `Forbidden: the credential may not review its rules in namespace ${namespace}`,
      failureKind: 'forbidden',
    };
  }
  return {
    namespace,
    incomplete: false,
    evaluationError: null,
    rules: structuredClone([...NAMESPACE_RULES]),
    error: null,
    failureKind: null,
  };
}

/** The `capabilities` step: a warning naming the reviewed share when some namespaces failed (NST-3). */
function capabilitiesStep(level: CapabilityLevel, rules: readonly NamespaceRules[]): ConnectionTestStepResult {
  const summary = HEADLINE_MESSAGE[level];
  const failed = rules.filter((entry) => entry.error !== null);
  const [firstFailed] = failed;
  if (!firstFailed) return { step: 'capabilities', status: 'passed', message: summary, failureKind: null };
  return {
    step: 'capabilities',
    status: 'warning',
    message: `${summary}; rules reviewed in ${rules.length - failed.length} of ${rules.length} namespaces`,
    failureKind: firstFailed.failureKind,
  };
}

/** A passing result for `serviceAccount` with the given capability headline on the cluster described by `context`. */
function passedResult(
  level: CapabilityLevel,
  serviceAccount: string,
  context: ConnectionTestContext = OPENSHIFT_CONTEXT,
): ConnectionTestResult {
  const versionStep = openShiftVersionStep(context, level !== 'clusterWideView');
  const namespaceRules = context.inspectNamespaces.map(namespaceRulesFor);
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
      distributionStep(context),
      versionStep,
      capabilitiesStep(level, namespaceRules),
    ],
    kubernetesVersion: 'v1.31.4',
    identity: {
      username: `system:serviceaccount:${serviceAccount.replace('/', ':')}`,
      source: 'selfSubjectReview',
    },
    detectedDistribution: context.servesOpenShift ? 'openShift' : 'kubernetes',
    openShiftVersion: versionStep.status === 'passed' ? { version: '4.18.12', updateProgressing: false } : null,
    capabilities: { headline: level, checks: checksFor(level) },
    namespaceRules,
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
  detectedDistribution: null,
  openShiftVersion: null,
  capabilities: null,
  namespaceRules: [],
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
  detectedDistribution: null,
  openShiftVersion: null,
  capabilities: null,
  namespaceRules: [],
  hints: [],
};

/** Canned result: cluster-wide edit plus the namespace rules of `payments` (one inspected namespace). */
export const connectionTestWithNamespaceRules: ConnectionTestResult = passedResult(
  'clusterWideEdit',
  'fleetconsole/fleet-edit',
  { ...OPENSHIFT_CONTEXT, inspectNamespaces: ['payments'] },
);

/**
 * Builds the result `POST …/test` / `…/test-token` returns for a credential's scenario on the cluster described by
 * `context`: a passing result checks the declared distribution against discovery (DIST-7/8) and has one
 * `namespaceRules` entry per inspected namespace, in order; failing results never reach those steps.
 */
export function connectionTestFor(
  scenario: ConnectionTestScenario,
  serviceAccount: string | null,
  context: ConnectionTestContext,
): ConnectionTestResult {
  const sa = serviceAccount ?? 'fleetconsole/unknown';
  const base: Record<ConnectionTestScenario, () => ConnectionTestResult> = {
    view: () => passedResult('clusterWideView', sa, context),
    edit: () => passedResult('clusterWideEdit', sa, context),
    admin: () => passedResult('clusterAdmin', sa, context),
    tlsFailure: () => connectionTestTlsFailure,
    authFailure: () => connectionTestAuthFailure,
  };
  return { ...base[scenario](), testedAt: new Date().toISOString() };
}
