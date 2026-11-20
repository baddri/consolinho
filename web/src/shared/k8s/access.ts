import { useQuery } from '@tanstack/react-query';
import { k8sCreate } from './client';
import { SelfSubjectAccessReviewModel } from './models';
import { k8sQueryKeys, type AccessReview } from './queryKeys';
import type { SelfSubjectAccessReview } from './types';

/** Access checks are cached briefly: RBAC rarely changes, and the server still enforces every request. */
const ACCESS_CHECK_TTL_MS = 60_000;

/** POSTs a `SelfSubjectAccessReview` for `review` and returns `status.allowed`. */
async function reviewAccess(cluster: string, review: AccessReview): Promise<boolean> {
  const answer = await k8sCreate<SelfSubjectAccessReview>(cluster, SelfSubjectAccessReviewModel, undefined, {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        verb: review.verb,
        group: review.model.group,
        resource: review.model.plural,
        ...(review.namespace ? { namespace: review.namespace } : {}),
        ...(review.name ? { name: review.name } : {}),
      },
    },
  });
  return answer.status?.allowed ?? false;
}

/**
 * Whether the grant's ServiceAccount may `verb` the `model` (in `namespace`, `name`) on `cluster` — a
 * SelfSubjectAccessReview (UI-9, ADR-0022 §9) used to hide or disable actions. Identical checks share one request
 * (query key) and are cached for 60 s. `allowed` is `undefined` while pending and `true` on error: the server stays
 * the authority and shows its 403, so a flaky check never locks the UI.
 *
 * Reflects only the cluster's RBAC; FleetConsole's read-only user/grant gating is applied by the caller.
 */
export function useCanI(
  cluster: string,
  review: AccessReview,
  opts: { enabled?: boolean } = {},
): { allowed: boolean | undefined; isPending: boolean } {
  const query = useQuery({
    queryKey: k8sQueryKeys.access(cluster, review),
    queryFn: () => reviewAccess(cluster, review),
    staleTime: ACCESS_CHECK_TTL_MS,
    gcTime: ACCESS_CHECK_TTL_MS,
    retry: false,
    enabled: opts.enabled ?? true,
  });
  const allowed = query.isError ? true : query.data;
  return { allowed, isPending: query.isPending };
}
