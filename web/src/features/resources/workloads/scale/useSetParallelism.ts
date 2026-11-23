import { k8sPatch, type K8sModel } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useSetParallelism} writes: the job and its new `spec.parallelism`. */
export interface SetParallelismVars extends MutationTarget {
  parallelism: number;
}

/**
 * Sets a Job's `spec.parallelism` (OCP `configureJobParallelismModal`): one JSON Patch `replace /spec/parallelism` on
 * the object itself (Jobs have no `scale` subresource), so it needs `patch <plural>`. Errors stay in the modal.
 */
export function useSetParallelism(cluster: string, model: K8sModel) {
  return useResourceMutation(cluster, {
    model,
    mutationFn: ({ namespace, name, parallelism }: SetParallelismVars) =>
      k8sPatch(cluster, model, { namespace, name }, [
        { op: 'replace', path: '/spec/parallelism', value: parallelism },
      ]),
    successMessage: ({ name, parallelism }) => `${name} parallelism set to ${String(parallelism)}`,
  });
}
