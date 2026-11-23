import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { k8sQueryKeys, type K8sModel } from '@/shared/k8s';
import { useToast } from '@/shared/ui';
import { useClusterDisplayName } from './useClusterDisplayName';

/** Shown when a failed write carries no message, so failure feedback is never blank (ACT-6). */
export const NO_MESSAGE_FALLBACK = 'The cluster returned no message.';

/** The object a mutation writes; its `get` query is invalidated on success. */
export interface MutationTarget {
  /** Ignored for cluster-scoped kinds. */
  namespace: string | undefined;
  name: string;
}

/** Options of {@link useResourceMutation}. */
export interface ResourceMutationOptions<V extends MutationTarget, R> {
  model: K8sModel;
  mutationFn: (vars: V) => Promise<R>;
  /** First part of the success toast, e.g. "web scaled to 3"; " on <cluster display name>" is appended. */
  successMessage: (vars: V, result: R) => string;
  /**
   * Modal-less actions (restart, pause, ring) have nowhere to show a failure inline: they set this and get a danger
   * toast "<action> failed" with the server's message. Modal actions leave it unset and render `error` inline.
   */
  toastErrors?: { action: string };
}

/** The message of a failed write, never blank: the proxy's ProblemDetails `detail` or the cluster's `Status.message`. */
export function mutationErrorMessage(error: unknown): string {
  const detail = error instanceof ApiError ? error.detail?.trim() : undefined;
  return detail === undefined || detail === '' ? NO_MESSAGE_FALLBACK : detail;
}

/**
 * One write of a resource action (ADR-0037 §4): a TanStack mutation whose success toasts "<message> on <cluster
 * display name>" and invalidates the object's `get` query (lists update through their watch). The callbacks live in
 * the `useMutation` options, not `mutate()`'s, so they run even if the dialog unmounted meanwhile.
 */
export function useResourceMutation<V extends MutationTarget, R>(
  cluster: string,
  { model, mutationFn, successMessage, toastErrors }: ResourceMutationOptions<V, R>,
): UseMutationResult<R, unknown, V> {
  const queryClient = useQueryClient();
  const toast = useToast();
  const displayName = useClusterDisplayName(cluster);
  return useMutation<R, unknown, V>({
    mutationFn,
    onSuccess: (result, vars) => {
      const namespace = model.namespaced ? vars.namespace : undefined;
      void queryClient.invalidateQueries({
        queryKey: k8sQueryKeys.get(cluster, model, namespace, vars.name),
        exact: true,
      });
      toast.success(`${successMessage(vars, result)} on ${displayName}`);
    },
    onError: (error) => {
      if (toastErrors) toast.danger(`${toastErrors.action} failed`, mutationErrorMessage(error));
    },
  });
}
