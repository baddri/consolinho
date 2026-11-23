import { k8sPatch, type K8sModel } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useScaleWorkload} writes: the workload and its new desired replica count. */
export interface ScaleWorkloadVars extends MutationTarget {
  replicas: number;
}

/** Options of {@link useScaleWorkload}. */
export interface ScaleWorkloadOptions {
  /** Modal-less callers (the ring arrows) toast failures; the Edit Pod count modal leaves this unset and shows them inline. */
  toastErrors?: { action: string };
}

/**
 * Scales any scalable workload (Deployment, DeploymentConfig, StatefulSet, ReplicaSet, ReplicationController) through
 * its `scale` subresource (ADR-0037 §4), as OCP's `configure-count-modal.tsx` does: a JSON Patch `replace
 * /spec/replicas` on `…/<plural>/<name>/scale`, which needs only `patch <plural>/scale`. Success toasts
 * "<name> scaled to <n> on <cluster>". Shared by the Edit Pod count modal and the ring arrows.
 */
export function useScaleWorkload(
  cluster: string,
  model: K8sModel,
  { toastErrors }: ScaleWorkloadOptions = {},
) {
  return useResourceMutation(cluster, {
    model,
    mutationFn: ({ namespace, name, replicas }: ScaleWorkloadVars) =>
      k8sPatch(cluster, model, { namespace, name, subresource: 'scale' }, [
        { op: 'replace', path: '/spec/replicas', value: replicas },
      ]),
    successMessage: ({ name, replicas }) => `${name} scaled to ${String(replicas)}`,
    toastErrors,
  });
}
