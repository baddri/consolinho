import type { Pod } from '@/shared/k8s';

/**
 * The status the OpenShift console shows for a pod: `Terminating` while being deleted, else the first container's
 * waiting or terminated reason (`CrashLoopBackOff`, `ContainerCreating`, `Completed`), else `status.phase`.
 */
export function podStatus(pod: Pod): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  for (const container of pod.status?.containerStatuses ?? []) {
    const reason = container.state?.waiting?.reason ?? container.state?.terminated?.reason;
    if (reason) return reason;
  }
  return pod.status?.phase ?? 'Unknown';
}
