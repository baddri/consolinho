import type { Pod } from '@/shared/k8s';

/** OCP `kubectl.kubernetes.io/default-container`: the container `kubectl logs/exec` (and OCP's Logs tab) pick first. */
const DEFAULT_CONTAINER_ANNOTATION = 'kubectl.kubernetes.io/default-container';

/** Names of the pod's containers, or init containers with `init`, in spec order. */
export function containerNames(pod: Pod, init = false): string[] {
  return ((init ? pod.spec?.initContainers : pod.spec?.containers) ?? []).map(({ name }) => name);
}

/**
 * The container a Logs/Terminal tab opens on: the default-container annotation when it names a container, else the
 * first (non-init) container, as OCP `PodLogs`. `''` for a pod without containers.
 */
export function defaultContainer(pod: Pod): string {
  const names = containerNames(pod);
  const annotated = pod.metadata?.annotations?.[DEFAULT_CONTAINER_ANNOTATION];
  return annotated !== undefined && names.includes(annotated) ? annotated : (names[0] ?? '');
}
