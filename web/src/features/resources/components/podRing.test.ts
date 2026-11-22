import type { Pod } from '@/shared/k8s';
import { podRingLabel, ringPodStatus } from './podRing';

function pod(status: Pod['status'], deleting = false): Pod {
  return { metadata: deleting ? { deletionTimestamp: '2026-11-17T00:00:00Z' } : {}, status };
}

const running = pod({
  phase: 'Running',
  containerStatuses: [
    { name: 'a', ready: true, restartCount: 0, image: 'i', imageID: '', state: { running: {} } },
  ],
});
const notReady = pod({
  phase: 'Running',
  containerStatuses: [
    { name: 'a', ready: false, restartCount: 0, image: 'i', imageID: '', state: { running: {} } },
  ],
});
const crashing = pod({
  phase: 'Running',
  containerStatuses: [
    {
      name: 'a',
      ready: false,
      restartCount: 3,
      image: 'i',
      imageID: '',
      state: { waiting: { reason: 'CrashLoopBackOff' } },
    },
  ],
});

describe('ringPodStatus (OCP getPodStatus)', () => {
  it.each([
    [running, 'Running'],
    [notReady, 'Not Ready'],
    [crashing, 'CrashLoopBackOff'],
    [pod({ phase: 'Pending' }), 'Pending'],
    [pod({ phase: 'Succeeded' }), 'Succeeded'],
    [pod({ phase: 'Running' }, true), 'Terminating'],
    [pod(undefined), 'Unknown'],
  ] as const)('%#: %s', (input, expected) => {
    expect(ringPodStatus(input)).toBe(expected);
  });
});

describe('podRingLabel (OCP podRingLabel)', () => {
  it('counts ready and failed pods against the desired count', () => {
    expect(podRingLabel({ spec: { replicas: 2 }, status: { readyReplicas: 2 } }, [running, running])).toEqual(
      {
        title: '2',
        subTitle: 'Pods',
      },
    );
    expect(podRingLabel({ spec: { replicas: 1 }, status: { readyReplicas: 1 } }, [running])).toEqual({
      title: '1',
      subTitle: 'Pod',
    });
    expect(
      podRingLabel({ spec: { replicas: 3 }, status: { readyReplicas: 1 } }, [running, notReady]),
    ).toEqual({
      title: '1',
      subTitle: 'Scaling to 3',
    });
    expect(
      podRingLabel({ spec: { replicas: 3 }, status: { readyReplicas: 2 } }, [running, running, crashing]),
    ).toEqual({
      title: '3',
      subTitle: 'Pods',
    });
  });

  it('shows the first pod coming up and a deployment scaled to zero', () => {
    expect(podRingLabel({ spec: { replicas: 2 }, status: {} }, [])).toEqual({
      title: '0',
      subTitle: 'Scaling to 2',
    });
    expect(podRingLabel({ spec: { replicas: 0 }, status: {} }, [])).toEqual({
      title: 'Scaled to 0',
      subTitle: '',
    });
  });
});
