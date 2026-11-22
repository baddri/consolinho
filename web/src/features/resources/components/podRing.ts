import type { Pod } from '@/shared/k8s';

/** The replica fields of a Deployment or ReplicaSet the ring label needs. */
export interface ReplicatedWorkload {
  spec?: { replicas?: number };
  status?: { readyReplicas?: number };
}

/** Pod states of the ring, as OCP `AllPodStatus` (`console-shared/src/constants/pod.ts`). */
export type RingPodStatus =
  | 'Running'
  | 'Not Ready'
  | 'Warning'
  | 'Failed'
  | 'CrashLoopBackOff'
  | 'Pending'
  | 'Succeeded'
  | 'Terminating'
  | 'Unknown';

/** OCP `podColor`: fixed colours, the same in light and dark themes. Order = order of the ring's segments. */
export const RING_COLORS: Readonly<Record<RingPodStatus, string>> = {
  Running: '#0066cc',
  'Not Ready': '#519de9',
  Warning: '#f0ab00',
  Failed: '#cc0000',
  CrashLoopBackOff: '#cc0000',
  Pending: '#8bc1f7',
  Succeeded: '#519149',
  Terminating: '#002f5d',
  Unknown: '#a18fff',
};

/** OCP `getPodStatus` (`console-shared/src/utils/pod-utils.ts`): the ring segment a pod falls into. */
export function ringPodStatus(pod: Pod): RingPodStatus {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  const phase = pod.status?.phase ?? 'Unknown';
  const statuses = pod.status?.containerStatuses ?? [];
  if (phase === 'Running') {
    const warnings = statuses.flatMap((status): RingPodStatus[] => {
      if (status.state?.terminated && status.state.terminated.exitCode !== 0) return ['Warning'];
      if (status.state?.waiting?.reason === 'CrashLoopBackOff') return ['CrashLoopBackOff'];
      return [];
    });
    if (warnings.includes('CrashLoopBackOff')) return 'CrashLoopBackOff';
    if (warnings.length > 0) return 'Warning';
    if (statuses.some((status) => !status.ready)) return 'Not Ready';
    return 'Running';
  }
  return phase in RING_COLORS ? (phase as RingPodStatus) : 'Unknown';
}

/** Ring title and subtitle. */
export interface PodRingLabel {
  title: string;
  subTitle: string;
}

/**
 * OCP `podRingLabel` default branch (Deployments, ReplicaSets): ready + failed pods over the desired count —
 * "2" / "Pods", "1" / "Scaling to 3", "0" / "Scaling to 3" while the first pod comes up, "Scaled to 0" without any.
 */
export function podRingLabel(workload: ReplicatedWorkload, pods: readonly Pod[]): PodRingLabel {
  const failed = pods.filter((pod) => ['CrashLoopBackOff', 'Failed'].includes(ringPodStatus(pod))).length;
  const current = (workload.status?.readyReplicas ?? 0) + failed;
  const desired = workload.spec?.replicas ?? 1;
  const scaling = `Scaling to ${String(desired)}`;
  if (current === 0) {
    const pending = (pods.length === 1 && pods[0]?.status?.phase === 'Pending') || desired > 0;
    return { title: pending ? '0' : 'Scaled to 0', subTitle: desired > 0 ? scaling : '' };
  }
  return {
    title: String(current),
    subTitle: current === desired ? (current === 1 ? 'Pod' : 'Pods') : scaling,
  };
}
