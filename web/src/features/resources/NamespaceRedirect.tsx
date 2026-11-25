import { Navigate, useLocation, useParams } from 'react-router';
import { ResourcePageSkeleton } from './components/ResourcePageSkeleton';
import { ALL_NAMESPACES, resourcePath } from './paths';
import { descriptorForPlural } from './registry/registry';
import { useFallbackTarget } from './useFallbackTarget';

/**
 * `k8s/:plural` (ADR-0023 §1, sidebar links): cluster-scoped kinds go to `k8s/cluster/<plural>`, namespaced (and
 * unknown) plurals to the project last used on this cluster (`useLastNamespace`, NS-2) or else all namespaces,
 * keeping the query string. Only when that would be all namespaces does it ask whether the token can list them
 * (skeleton meanwhile); if not (NSF-3) it goes to the first configured namespace, or to the cluster root (its empty
 * state, NSF-4) when there is none.
 */
export function NamespaceRedirect() {
  const { cluster = '', plural = '' } = useParams();
  const { search } = useLocation();
  const model = descriptorForPlural(plural)?.model ?? { plural, namespaced: true };
  const fallback = useFallbackTarget(cluster, { needsCheck: model.namespaced });

  if (fallback.isFallback === undefined) return <ResourcePageSkeleton />;
  if (fallback.isFallback && !fallback.target) return <Navigate replace to={`/c/${encodeURIComponent(cluster)}`} />;
  const namespace = fallback.isFallback ? fallback.target : (fallback.lastNamespace ?? ALL_NAMESPACES);
  return <Navigate replace to={resourcePath(cluster, model, { namespace, search })} />;
}
