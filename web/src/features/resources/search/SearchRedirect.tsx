import { Navigate, useLocation, useParams } from 'react-router';
import { useLastNamespace } from '@/features/cluster-context';
import { ALL_NAMESPACES } from '../paths';
import { searchPath } from './searchPath';

/**
 * `search` (the Home → Search link): goes to the project last used on this cluster ({@link useLastNamespace}, as
 * `NamespaceRedirect` does for lists) or else all projects, keeping the query string.
 */
export function SearchRedirect() {
  const { cluster = '' } = useParams();
  const { search } = useLocation();
  const [lastNamespace] = useLastNamespace(cluster);
  return <Navigate replace to={searchPath(cluster, { namespace: lastNamespace ?? ALL_NAMESPACES, search })} />;
}
