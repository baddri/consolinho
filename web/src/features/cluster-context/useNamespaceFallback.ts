import { NamespaceModel, ProjectModel, useCanI, useK8sDiscovery } from '@/shared/k8s';
import { useAccessibleClusters } from './useAccessibleClusters';

/** Result of {@link useNamespaceFallback}. */
export interface NamespaceFallback {
  /** `true` = the token may not list the selector's kind; `undefined` while discovery/SSAR are pending. */
  isFallback: boolean | undefined;
  /** `AccessibleCluster.fallbackNamespaces` of `cluster` (saved order), `[]` when none or unknown. */
  namespaces: string[];
}

/** Shared empty list, so callers memoising on `namespaces` don't see a new array every render. */
const NONE: string[] = [];

/**
 * Whether the project selector on `cluster` must fall back to the namespaces the admin configured for the user's
 * access (NSF-1): asks a SelfSubjectAccessReview for `list` of the selector's kind (projects where discovery serves
 * them, else namespaces — the rule of `useProjectOptions`). The check is cached for 60 s, shared with other callers,
 * and fails open (an erroring review means "not fallback"; the list's own 403 still switches the selector over).
 * Deliberately never fetches the Namespace object itself, and has no distribution check (DIST-5).
 *
 * `enabled: false` defers the review (pages must not send access reviews on render, T-0370); a cached answer is still
 * returned, so `isFallback` is known early once any caller (the landing redirect, an opened selector) has asked.
 */
export function useNamespaceFallback(cluster: string, opts: { enabled?: boolean } = {}): NamespaceFallback {
  const discovery = useK8sDiscovery(cluster);
  const model = discovery.isServed(ProjectModel) ? ProjectModel : NamespaceModel;
  const { allowed } = useCanI(cluster, { verb: 'list', model }, {
    enabled: (opts.enabled ?? true) && !discovery.isPending,
  });
  const clusters = useAccessibleClusters();
  const namespaces = clusters.data?.find((entry) => entry.name === cluster)?.fallbackNamespaces ?? NONE;
  const isFallback = discovery.isPending || allowed === undefined ? undefined : !allowed;
  return { isFallback, namespaces };
}
