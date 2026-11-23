import { DeploymentModel, k8sPatch } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useScaleDeployment} writes: the deployment and its new desired replica count. */
export interface ScaleDeploymentVars extends MutationTarget {
  replicas: number;
}

/** Options of {@link useScaleDeployment}. */
export interface ScaleDeploymentOptions {
  /** Modal-less callers (the ring arrows) toast failures; the Edit Pod count modal leaves this unset and shows them inline. */
  toastErrors?: { action: string };
}

/**
 * Scales a deployment through its `scale` subresource (ADR-0037 §4), as OCP's `configure-count-modal.tsx` does: a
 * JSON Patch `replace /spec/replicas` on `…/deployments/<name>/scale`, which needs only `patch deployments/scale`.
 * Success toasts "<name> scaled to <n> on <cluster>". Shared by the Edit Pod count modal and the ring (T-0184).
 */
export function useScaleDeployment(cluster: string, { toastErrors }: ScaleDeploymentOptions = {}) {
  return useResourceMutation(cluster, {
    model: DeploymentModel,
    mutationFn: ({ namespace, name, replicas }: ScaleDeploymentVars) =>
      k8sPatch(cluster, DeploymentModel, { namespace, name, subresource: 'scale' }, [
        { op: 'replace', path: '/spec/replicas', value: replicas },
      ]),
    successMessage: ({ name, replicas }) => `${name} scaled to ${String(replicas)}`,
    toastErrors,
  });
}
