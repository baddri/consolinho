import { Navigate, useLocation, useParams } from 'react-router';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { ALL_NAMESPACES } from '../paths';
import { useFallbackTarget } from '../useFallbackTarget';
import { searchPath } from './searchPath';

/**
 * `search` (the Home → Search link): goes to the project last used on this cluster (`useLastNamespace`, as
 * `NamespaceRedirect` does for lists) or else all projects, keeping the query string. With no remembered project it
 * first asks whether the token can list them (skeleton meanwhile); if not (NSF-3) it searches the first configured
 * namespace, or goes to the cluster root (its empty state, NSF-4) when there is none.
 */
export function SearchRedirect() {
  const { cluster = '' } = useParams();
  const { search } = useLocation();
  const fallback = useFallbackTarget(cluster);

  if (fallback.isFallback === undefined) return <ResourcePageSkeleton />;
  if (fallback.isFallback && !fallback.target) return <Navigate replace to={`/c/${encodeURIComponent(cluster)}`} />;
  const namespace = fallback.isFallback ? fallback.target : (fallback.lastNamespace ?? ALL_NAMESPACES);
  return <Navigate replace to={searchPath(cluster, { namespace, search })} />;
}
