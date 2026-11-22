import type { Pod } from '@/shared/k8s';
import { podStatus } from './kinds/pods';
import { descriptorForKind, descriptorForPlural, resourceDescriptors } from './registry';

describe('resource registry', () => {
  it('has unique plurals (they are the URL segment, ADR-0023 §3)', () => {
    const plurals = resourceDescriptors().map((descriptor) => descriptor.model.plural);
    expect(new Set(plurals).size).toBe(plurals.length);
  });

  it('sorts every table list by a sortable column by default', () => {
    // The event stream (T-0124) has no columns: it is always newest first.
    for (const descriptor of resourceDescriptors().filter((d) => d.listLayout !== 'eventStream')) {
      const columnId = descriptor.defaultSort?.columnId ?? 'name';
      expect(
        descriptor.columns.some((column) => column.id === columnId && column.sortValue !== undefined),
      ).toBe(true);
    }
  });

  it('looks descriptors up by plural and by apiVersion + kind', () => {
    expect(descriptorForPlural('pods')?.model.kind).toBe('Pod');
    expect(descriptorForPlural('nodes')).toBeUndefined();
    expect(descriptorForKind('v1', 'ConfigMap')?.model.plural).toBe('configmaps');
    expect(descriptorForKind('apps/v1', 'ReplicaSet')?.model.plural).toBe('replicasets');
    expect(descriptorForKind('apps/v1', 'StatefulSet')).toBeUndefined();
    expect(descriptorForKind('v2', 'Pod')).toBeUndefined();
  });
});

describe('podStatus', () => {
  const pod = (status: Pod['status'], deletionTimestamp?: string): Pod => ({
    metadata: { name: 'p', deletionTimestamp },
    status,
  });
  const container = (
    state: NonNullable<NonNullable<Pod['status']>['containerStatuses']>[number]['state'],
  ) => ({
    name: 'c',
    image: 'i',
    imageID: '',
    ready: false,
    restartCount: 0,
    state,
  });

  it.each([
    ['Terminating', pod({ phase: 'Running' }, '2026-11-20T10:00:00Z')],
    [
      'CrashLoopBackOff',
      pod({ phase: 'Running', containerStatuses: [container({ waiting: { reason: 'CrashLoopBackOff' } })] }),
    ],
    [
      'Error',
      pod({
        phase: 'Failed',
        containerStatuses: [container({ terminated: { exitCode: 1, reason: 'Error' } })],
      }),
    ],
    ['Running', pod({ phase: 'Running', containerStatuses: [container({ running: {} })] })],
    ['Pending', pod({ phase: 'Pending' })],
    ['Unknown', pod(undefined)],
  ])('is %s', (expected, input) => {
    expect(podStatus(input)).toBe(expected);
  });
});
