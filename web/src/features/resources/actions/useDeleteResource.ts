import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { k8sDelete, k8sQueryKeys, type K8sModel, type PropagationPolicy } from '@/shared/k8s';
import { useToast } from '@/shared/ui';

/** The object {@link useDeleteResource} deletes. */
export interface DeleteTarget {
  /** Ignored for cluster-scoped kinds. */
  namespace: string | undefined;
  name: string;
  /** Sent as `DeleteOptions.propagationPolicy` when set (OCP's "Delete dependent objects" checkbox). */
  propagationPolicy?: PropagationPolicy;
}

/** Options of {@link useDeleteResource}. */
export interface DeleteResourceOptions {
  /** Runs after a successful delete, even if the calling component has unmounted meanwhile. */
  onDeleted?: () => void;
}

/**
 * The cluster's own 404 `NotFound` on DELETE means the object is already gone — the outcome the user asked for. The
 * proxy's 404 `Proxy.NotAvailable` (no access to the cluster) is a real failure.
 */
function isAlreadyGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === 'Kubernetes.NotFound';
}

/**
 * Deletes one object of `model` on `cluster` through the proxy (UI-8), toasts "<name> deleted from <cluster>" and
 * runs `onDeleted`. Both run from the `useMutation` options, not `mutate()`'s: the watch's DELETED event can unmount
 * the dialog (list row removed, details page turned "not found") before the DELETE response arrives, and TanStack
 * skips `mutate()`-level callbacks of an unmounted observer. On success the object's `get` query is dropped so a later
 * visit doesn't flash it; lists are never refetched — their watch removes the row. Errors are the proxy's
 * ProblemDetails (`Proxy.UserReadOnly`, `Proxy.ReadOnlyGrant`) or the cluster's `Status`; a 404 counts as success.
 */
export function useDeleteResource(
  cluster: string,
  model: K8sModel,
  { onDeleted }: DeleteResourceOptions = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ namespace, name, propagationPolicy }: DeleteTarget) => {
      try {
        await k8sDelete(cluster, model, namespace, name, propagationPolicy);
      } catch (error) {
        if (!isAlreadyGone(error)) throw error;
      }
    },
    onSuccess: (_result, { namespace, name }) => {
      queryClient.removeQueries({ queryKey: k8sQueryKeys.get(cluster, model, namespace, name), exact: true });
      toast.success(`${name} deleted from ${cluster}`);
      onDeleted?.();
    },
  });
}
