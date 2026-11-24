import type { FleetClusterOperators, FleetClusterVersion, FleetNodes } from '@/shared/api';
import {
  clusterHealth,
  clusterUpdate,
  clusterVersionText,
  HEALTH_SEVERITY,
  type ClusterHealthFacts,
  type ClusterHealthStatus,
  type RestrictedProbe,
} from './clusterHealth';

const cvOk: FleetClusterVersion = {
  outcome: 'ok',
  currentVersion: '4.16.3',
  desiredVersion: '4.16.3',
  available: true,
  progressing: false,
  failing: false,
  availableUpdates: 0,
};
const coOk: FleetClusterOperators = { outcome: 'ok', total: 33, degraded: 0, unavailable: 0, progressing: 0 };
const nodesOk: FleetNodes = { outcome: 'ok', total: 6, ready: 6, notReady: 0, unschedulable: 0 };
const forbiddenCv: FleetClusterVersion = {
  outcome: 'forbidden',
  currentVersion: null,
  desiredVersion: null,
  available: null,
  progressing: null,
  failing: null,
  availableUpdates: null,
};
const forbiddenCo: FleetClusterOperators = {
  outcome: 'forbidden',
  total: null,
  degraded: null,
  unavailable: null,
  progressing: null,
};
const forbiddenNodes: FleetNodes = {
  outcome: 'forbidden',
  total: null,
  ready: null,
  notReady: null,
  unschedulable: null,
};

/** A healthy OpenShift cluster; rows override the sections they are about. */
const ocp = (patch: Partial<ClusterHealthFacts> = {}): ClusterHealthFacts => ({
  failure: null,
  kubernetesVersion: null,
  clusterVersion: cvOk,
  clusterOperators: coOk,
  nodes: nodesOk,
  ...patch,
});
const failed = (failure: ClusterHealthFacts['failure']): ClusterHealthFacts => ({
  failure,
  kubernetesVersion: null,
  clusterVersion: null,
  clusterOperators: null,
  nodes: null,
});

describe('clusterHealth (contract §2.1)', () => {
  const rows: [string, ClusterHealthFacts, ClusterHealthStatus, RestrictedProbe[]][] = [
    ['unreachable', failed('unreachable'), 'unreachable', []],
    ['timeout', failed('timeout'), 'unreachable', []],
    ['tlsError', failed('tlsError'), 'unreachable', []],
    ['upstreamError', failed('upstreamError'), 'unreachable', []],
    ['tokenInvalid', failed('tokenInvalid'), 'tokenInvalid', []],
    ['blockedByPolicy', failed('blockedByPolicy'), 'restricted', []],
    ['ClusterVersion failing', ocp({ clusterVersion: { ...cvOk, failing: true } }), 'degraded', []],
    ['an operator degraded', ocp({ clusterOperators: { ...coOk, degraded: 1 } }), 'degraded', []],
    ['an operator unavailable', ocp({ clusterOperators: { ...coOk, unavailable: 2 } }), 'degraded', []],
    ['a node not ready', ocp({ nodes: { ...nodesOk, ready: 5, notReady: 1 } }), 'degraded', []],
    [
      'updating',
      ocp({ clusterVersion: { ...cvOk, progressing: true, desiredVersion: '4.16.4' } }),
      'updating',
      [],
    ],
    [
      'degraded beats updating',
      ocp({ clusterVersion: { ...cvOk, progressing: true, failing: true } }),
      'degraded',
      [],
    ],
    ['nodes forbidden', ocp({ nodes: forbiddenNodes }), 'restricted', ['Nodes']],
    [
      'every OpenShift section forbidden',
      ocp({ clusterVersion: forbiddenCv, clusterOperators: forbiddenCo, nodes: forbiddenNodes }),
      'restricted',
      ['ClusterVersion', 'ClusterOperators', 'Nodes'],
    ],
    [
      'Kubernetes version forbidden',
      {
        ...ocp({ clusterVersion: null, clusterOperators: null }),
        kubernetesVersion: { outcome: 'forbidden', gitVersion: null },
      },
      'restricted',
      ['version'],
    ],
    [
      'Restricted listed alongside Degraded',
      ocp({ clusterVersion: forbiddenCv, nodes: { ...nodesOk, notReady: 1 } }),
      'degraded',
      ['ClusterVersion'],
    ],
    [
      'Restricted listed alongside Updating',
      ocp({ clusterVersion: { ...cvOk, progressing: true }, clusterOperators: forbiddenCo }),
      'updating',
      ['ClusterOperators'],
    ],
    [
      'ClusterVersion notFound is not Restricted',
      ocp({ clusterVersion: { ...forbiddenCv, outcome: 'notFound' } }),
      'healthy',
      [],
    ],
    ['healthy OpenShift', ocp(), 'healthy', []],
    [
      'healthy Kubernetes',
      {
        ...ocp({ clusterVersion: null, clusterOperators: null }),
        kubernetesVersion: { outcome: 'ok', gitVersion: 'v1.31.4' },
      },
      'healthy',
      [],
    ],
  ];

  it.each(rows)('%s', (_name, facts, status, restricted) => {
    expect(clusterHealth(facts)).toEqual({ status, restricted });
  });

  it('ranks statuses worst first in rule order (FLT-5)', () => {
    const order = (Object.keys(HEALTH_SEVERITY) as ClusterHealthStatus[]).sort(
      (a, b) => HEALTH_SEVERITY[a] - HEALTH_SEVERITY[b],
    );
    expect(order).toEqual(['unreachable', 'tokenInvalid', 'degraded', 'updating', 'restricted', 'healthy']);
  });
});

describe('clusterUpdate (Update cell)', () => {
  it.each([
    ['no ClusterVersion', null, undefined],
    ['forbidden', forbiddenCv, undefined],
    ['failing wins over progressing', { ...cvOk, failing: true, progressing: true }, { kind: 'failing' }],
    [
      'updating',
      { ...cvOk, progressing: true, desiredVersion: '4.16.4' },
      { kind: 'updating', version: '4.16.4' },
    ],
    ['update available', { ...cvOk, availableUpdates: 3 }, { kind: 'available', count: 3 }],
    ['up to date', cvOk, { kind: 'upToDate' }],
  ] as const)('%s', (_name, cv, expected) => {
    expect(clusterUpdate(cv)).toEqual(expected);
  });
});

describe('clusterVersionText (Version cell)', () => {
  it('prefers the OpenShift version, falls back to gitVersion, else undefined', () => {
    expect(clusterVersionText(ocp())).toBe('4.16.3');
    expect(
      clusterVersionText({ ...failed(null), kubernetesVersion: { outcome: 'ok', gitVersion: 'v1.31.4' } }),
    ).toBe('v1.31.4');
    expect(clusterVersionText(failed('timeout'))).toBeUndefined();
  });
});
