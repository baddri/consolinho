import { ApiError } from '@/shared/api';
import type { ClusterOperator, ClusterVersion, K8sCondition, Node } from '@/shared/k8s';
import { clusterHealth } from './clusterHealth';
import {
  clusterOperatorFacts,
  clusterOperatorStatus,
  clusterOperatorStatusAndMessage,
  clusterOperatorVersion,
  clusterVersionFacts,
  isUnschedulable,
  nodeFacts,
  nodeReadiness,
  probeOutcome,
  type ClusterOperatorStatus,
} from './facts';

const cond = (type: string, status: K8sCondition['status'], message?: string): K8sCondition =>
  message === undefined ? { type, status } : { type, status, message };

const clusterVersion = (status: ClusterVersion['status']): ClusterVersion => ({
  apiVersion: 'config.openshift.io/v1',
  kind: 'ClusterVersion',
  metadata: { name: 'version' },
  status,
});
const operator = (name: string, conditions: K8sCondition[], version?: string): ClusterOperator => ({
  apiVersion: 'config.openshift.io/v1',
  kind: 'ClusterOperator',
  metadata: { name },
  status: { conditions, ...(version ? { versions: [{ name: 'operator', version }] } : {}) },
});
const node = (name: string, ready?: K8sCondition['status'], unschedulable?: boolean): Node => ({
  metadata: { name },
  ...(unschedulable === undefined ? {} : { spec: { unschedulable } }),
  status: { conditions: ready === undefined ? [] : [{ type: 'Ready', status: ready }] },
});
const apiError = (status: number) => new ApiError({ status, title: 'x' });

describe('probeOutcome', () => {
  it('maps 403 and 404; anything else is unknown', () => {
    expect(probeOutcome(apiError(403))).toBe('forbidden');
    expect(probeOutcome(apiError(404))).toBe('notFound');
    expect(probeOutcome(apiError(500))).toBeUndefined();
    expect(probeOutcome(new Error('boom'))).toBeUndefined();
  });
});

describe('clusterVersionFacts', () => {
  it.each([
    [
      'current version = newest Completed history entry (history is newest first)',
      clusterVersion({
        desired: { version: '4.16.4' },
        history: [
          { state: 'Partial', version: '4.16.4' },
          { state: 'Completed', version: '4.16.3' },
          { state: 'Completed', version: '4.15.9' },
        ],
        conditions: [cond('Available', 'True'), cond('Progressing', 'True'), cond('Failing', 'False')],
        availableUpdates: [{ version: '4.16.5' }, { version: '4.16.6' }],
      }),
      {
        outcome: 'ok',
        currentVersion: '4.16.3',
        desiredVersion: '4.16.4',
        available: true,
        progressing: true,
        failing: false,
        availableUpdates: 2,
      },
    ],
    [
      'no Completed entry → desired version; absent conditions → null; null updates → 0',
      clusterVersion({
        desired: { version: '4.17.0' },
        history: [{ state: 'Partial', version: '4.17.0' }],
        availableUpdates: null,
      }),
      {
        outcome: 'ok',
        currentVersion: '4.17.0',
        desiredVersion: '4.17.0',
        available: null,
        progressing: null,
        failing: null,
        availableUpdates: 0,
      },
    ],
  ])('%s', (_name, cv, expected) => {
    expect(clusterVersionFacts(cv)).toEqual(expected);
  });

  it('reports forbidden / notFound sections and null while loading or after other errors', () => {
    expect(clusterVersionFacts(undefined, apiError(403))).toMatchObject({
      outcome: 'forbidden',
      currentVersion: null,
    });
    expect(clusterVersionFacts(undefined, apiError(404))).toMatchObject({ outcome: 'notFound' });
    expect(clusterVersionFacts(undefined, apiError(503))).toBeNull();
    expect(clusterVersionFacts(undefined)).toBeNull();
  });
});

describe('clusterOperatorStatus (OCP getStatusAndMessage order)', () => {
  it.each<[string, K8sCondition[], ClusterOperatorStatus]>([
    [
      'Upgradeable False wins over everything',
      [cond('Upgradeable', 'False'), cond('Available', 'False'), cond('Degraded', 'True')],
      'Cannot update',
    ],
    [
      'Available False before Degraded',
      [cond('Available', 'False'), cond('Degraded', 'True')],
      'Unavailable',
    ],
    [
      'Degraded before Progressing',
      [cond('Available', 'True'), cond('Degraded', 'True'), cond('Progressing', 'True')],
      'Degraded',
    ],
    ['Progressing before Available', [cond('Available', 'True'), cond('Progressing', 'True')], 'Progressing'],
    [
      'Available',
      [cond('Available', 'True'), cond('Degraded', 'False'), cond('Upgradeable', 'True')],
      'Available',
    ],
    ['Available Unknown', [cond('Available', 'Unknown')], 'Unknown'],
    ['no conditions', [], 'Unknown'],
  ])('%s', (_name, conditions, expected) => {
    expect(clusterOperatorStatus(operator('dns', conditions))).toBe(expected);
  });

  it('returns the deciding condition message and the operator version', () => {
    const co = operator('dns', [cond('Degraded', 'True', 'DNS pods are crashing')], '4.16.3');
    expect(clusterOperatorStatusAndMessage(co)).toEqual({
      status: 'Degraded',
      message: 'DNS pods are crashing',
    });
    expect(clusterOperatorVersion(co)).toBe('4.16.3');
    expect(clusterOperatorVersion(operator('x', []))).toBeUndefined();
  });
});

describe('clusterOperatorFacts', () => {
  it('counts degraded, unavailable (not True incl. missing) and progressing', () => {
    const facts = clusterOperatorFacts([
      operator('a', [cond('Available', 'True')]),
      operator('b', [cond('Available', 'True'), cond('Degraded', 'True'), cond('Progressing', 'True')]),
      operator('c', [cond('Available', 'False')]),
      operator('d', [cond('Available', 'Unknown')]),
      operator('e', []),
    ]);
    expect(facts).toEqual({ outcome: 'ok', total: 5, degraded: 1, unavailable: 3, progressing: 1 });
    expect(clusterOperatorFacts(undefined, apiError(403))).toEqual({
      outcome: 'forbidden',
      total: null,
      degraded: null,
      unavailable: null,
      progressing: null,
    });
  });
});

describe('nodes', () => {
  it.each([
    ['Ready True', node('a', 'True'), 'Ready'],
    ['Ready False', node('b', 'False'), 'NotReady'],
    ['Ready Unknown', node('c', 'Unknown'), 'Unknown'],
    ['no Ready condition', node('d'), 'Unknown'],
  ] as const)('%s → %s', (_name, n, expected) => {
    expect(nodeReadiness(n)).toBe(expected);
  });

  it('counts ready, not ready (False or Unknown) and cordoned nodes', () => {
    const cordoned = node('a', 'True', true);
    const notReady = node('c', 'False');
    const nodes = [cordoned, node('b', 'True', false), notReady, node('d', 'Unknown')];
    expect(isUnschedulable(cordoned)).toBe(true);
    expect(isUnschedulable(notReady)).toBe(false);
    expect(nodeFacts(nodes)).toEqual({ outcome: 'ok', total: 4, ready: 2, notReady: 2, unschedulable: 1 });
  });
});

describe('OVW-3 feeds the same rules', () => {
  it('derives Degraded + Restricted from raw objects', () => {
    const health = clusterHealth({
      failure: null,
      kubernetesVersion: null,
      clusterVersion: clusterVersionFacts(undefined, apiError(403)),
      clusterOperators: clusterOperatorFacts([operator('a', [cond('Available', 'True')])]),
      nodes: nodeFacts([node('a', 'True'), node('b', 'Unknown')]),
    });
    expect(health).toEqual({ status: 'degraded', restricted: ['ClusterVersion'] });
  });
});
