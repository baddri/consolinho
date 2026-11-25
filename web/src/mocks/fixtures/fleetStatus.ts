import type {
  ClusterDistribution,
  FleetClusterOperators,
  FleetClusterStatus,
  FleetClusterVersion,
  FleetNodes,
} from '@/shared/api';

/**
 * How the mock `GET /api/fleet/status` (T-0341) answers for one cluster: its line without `cluster`/`checkedAt` (the
 * handler adds both) and when it is flushed, so progressive rendering is visible in mock mode.
 */
export interface FleetScenario {
  /** Milliseconds after the request starts. `lab-1` takes the server's whole `Fleet:ClusterTimeout` (5 s). */
  delayMs: number;
  line: Omit<FleetClusterStatus, 'cluster' | 'checkedAt'>;
}

// Mirrors the mock API server's objects (`k8s/clusterFixtures.ts`, `k8s/computeFixtures.ts`, `k8s/rbac.ts`, T-0331):
// 6 nodes and 10 ClusterOperators per cluster, OpenShift 4.18.12 with two available updates. Keep both in sync.
const VERSION = '4.18.12';
const NEXT_VERSION = '4.18.14';
const NODE_COUNT = 6;
const OPERATOR_COUNT = 10;

const nodes = (notReady = 0): FleetNodes => ({
  outcome: 'ok',
  total: NODE_COUNT,
  ready: NODE_COUNT - notReady,
  notReady,
  unschedulable: 0,
});

const operators = (
  counts: Partial<Pick<FleetClusterOperators, 'degraded' | 'progressing'>> = {},
): FleetClusterOperators => ({
  outcome: 'ok',
  total: OPERATOR_COUNT,
  degraded: counts.degraded ?? 0,
  unavailable: 0,
  progressing: counts.progressing ?? 0,
});

const clusterVersion = (overrides: Partial<FleetClusterVersion> = {}): FleetClusterVersion => ({
  outcome: 'ok',
  currentVersion: VERSION,
  desiredVersion: VERSION,
  available: true,
  progressing: false,
  failing: false,
  availableUpdates: 2,
  ...overrides,
});

/** A healthy OpenShift line; `overrides` replace whole sections. */
const openShift = (overrides: Partial<FleetScenario['line']> = {}): FleetScenario['line'] => ({
  failure: null,
  kubernetesVersion: null,
  clusterVersion: clusterVersion(),
  clusterOperators: operators(),
  nodes: nodes(),
  ...overrides,
});

/** A healthy Kubernetes line: `GET /version` and nodes only. */
const kubernetes = (): FleetScenario['line'] => ({
  failure: null,
  kubernetesVersion: { outcome: 'ok', gitVersion: 'v1.31.4' },
  clusterVersion: null,
  clusterOperators: null,
  nodes: nodes(),
});

/**
 * Fleet status scenarios by cluster name (FLT-3..6): healthy with updates, Restricted, Kubernetes, Updating, Degraded
 * and an unreachable (timed out) cluster, flushed between 100 ms and 5 s.
 */
export const fleetScenarios: Readonly<Record<string, FleetScenario>> = {
  'prod-eu-1': { delayMs: 400, line: openShift() },
  // The view credential may not list ClusterOperators (`k8s/rbac.ts`) → Restricted.
  'prod-us-1': {
    delayMs: 900,
    line: openShift({
      clusterOperators: {
        outcome: 'forbidden',
        total: null,
        degraded: null,
        unavailable: null,
        progressing: null,
      },
    }),
  },
  'prod-k8s-1': { delayMs: 250, line: kubernetes() },
  'staging-eu-1': {
    delayMs: 1500,
    line: openShift({
      clusterVersion: clusterVersion({
        desiredVersion: NEXT_VERSION,
        progressing: true,
        availableUpdates: 1,
      }),
      clusterOperators: operators({ progressing: 2 }),
    }),
  },
  'dev-1': { delayMs: 100, line: openShift({ clusterVersion: clusterVersion({ availableUpdates: 0 }) }) },
  // Declared Kubernetes but serves OpenShift (DIST-5): the `ingress` operator is Degraded and worker-3 NotReady.
  'dev-2': {
    delayMs: 600,
    line: openShift({ clusterOperators: operators({ degraded: 1 }), nodes: nodes(1) }),
  },
  'lab-1': {
    delayMs: 5000,
    line: {
      failure: 'timeout',
      kubernetesVersion: null,
      clusterVersion: null,
      clusterOperators: null,
      nodes: null,
    },
  },
};

/** The scenario of `name`; clusters added in mock mode answer healthy for their declared distribution after 300 ms. */
export function fleetScenarioFor(name: string, distribution: ClusterDistribution): FleetScenario {
  return (
    fleetScenarios[name] ?? { delayMs: 300, line: distribution === 'kubernetes' ? kubernetes() : openShift() }
  );
}
