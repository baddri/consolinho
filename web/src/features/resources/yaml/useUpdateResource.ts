import { useMutation, useQueryClient } from '@tanstack/react-query';
import { k8sQueryKeys, k8sUpdate, type K8sModel, type K8sResource } from '@/shared/k8s';

/**
 * Replaces one object of `model` on `cluster` (`PUT` through the proxy, UI-7). The body must carry the
 * `resourceVersion` the edit started from (see `parseEdited`), so a concurrent change fails with 409
 * `Kubernetes.Conflict` — never retried or overwritten here. On success the object's `get` query takes the server's
 * answer at once (the watch confirms it later), from the `useMutation` options so it happens even if the tab unmounted
 * meanwhile; the tab reports success inline like OCP. Errors are the proxy's ProblemDetails or the cluster's `Status`
 * as `ApiError`.
 */
export function useUpdateResource(cluster: string, model: K8sModel) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (obj: K8sResource) => k8sUpdate(cluster, model, obj),
    onSuccess: (saved) => {
      const { namespace, name = '' } = saved.metadata;
      queryClient.setQueryData(k8sQueryKeys.get(cluster, model, namespace, name), saved);
    },
  });
}
