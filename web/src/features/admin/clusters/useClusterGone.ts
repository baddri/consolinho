import { isApiError } from '@/shared/api';
import { useToast } from '@/shared/ui';

/** `true` for the Api's 404 `Clusters.NotFound`: the cluster was deleted meanwhile (another admin or tab). */
export function isClusterGone(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/** Toast title shown when an admin acts on, or looks at, a cluster that was deleted meanwhile (T-0033 review). */
export const clusterGoneTitle = (name: string) => `Cluster ${name} no longer exists`;

/** Toast body of {@link clusterGoneTitle}. */
export const CLUSTER_GONE_BODY = 'It was deleted, possibly by another administrator.';

/**
 * Error callback for a lifecycle dialog's mutation: on 404 (cluster deleted meanwhile) it closes the dialog and
 * either hands over to `onGone` (the detail page, which also leaves the page) or shows the "no longer exists" toast
 * itself (the list, whose row — and with it the dialog — disappears on the following refetch). Other errors are left
 * to the dialog's inline alert.
 */
export function useClusterGoneHandler(name: string, onClose: () => void, onGone?: () => void) {
  const toast = useToast();
  return (error: unknown) => {
    if (!isClusterGone(error)) return;
    if (onGone) onGone();
    else toast.warning(clusterGoneTitle(name), CLUSTER_GONE_BODY);
    onClose();
  };
}
