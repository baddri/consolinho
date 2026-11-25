import { useLastNamespace, useNamespaceFallback } from '@/features/cluster-context';

/** Options of {@link useFallbackTarget}. */
export interface FallbackTargetOptions {
  /** `false` for a target that never depends on namespaces (a cluster-scoped kind): no access check. Default `true`. */
  needsCheck?: boolean;
  /** Check even when a namespace is remembered (the cluster landing, whose normal target is a cluster-scoped list). */
  always?: boolean;
}

/** Result of {@link useFallbackTarget}. */
export interface FallbackTarget {
  /**
   * Whether to route as a token that can't list namespaces; `undefined` while the access check is pending. `false`
   * without asking when the check was skipped: then the remembered namespace is the target either way.
   */
  isFallback: boolean | undefined;
  /** The namespace last used on the cluster, else the first configured fallback namespace; `undefined` if neither. */
  target: string | undefined;
  /** The namespace last used on the cluster (`undefined` = none, or all namespaces). */
  lastNamespace: string | undefined;
}

/**
 * Where the cluster landing and the `k8s/<plural>` / `search` redirects send a user whose token can't list namespaces
 * (NSF-3): the last used namespace, else the first namespace configured for their access — never all namespaces.
 * The access check ({@link useNamespaceFallback}) runs only when the redirect would otherwise go to all namespaces or
 * a cluster-scoped list, so a remembered namespace redirects at once without a round trip. The check is shared and
 * cached, so it also lets the project selector word its toggle for fallback mode without being opened.
 */
export function useFallbackTarget(
  cluster: string,
  { needsCheck = true, always = false }: FallbackTargetOptions = {},
): FallbackTarget {
  const [lastNamespace] = useLastNamespace(cluster);
  const check = needsCheck && (always || lastNamespace === undefined);
  const { isFallback, namespaces } = useNamespaceFallback(cluster, { enabled: check });
  return { isFallback: check ? isFallback : false, target: lastNamespace ?? namespaces[0], lastNamespace };
}
