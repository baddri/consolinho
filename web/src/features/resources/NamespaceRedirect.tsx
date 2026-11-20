import { Navigate, useLocation, useParams } from 'react-router';
import { useLastNamespace } from '@/features/cluster-context';
import { ALL_NAMESPACES, resourcePath } from './paths';
import { descriptorForPlural } from './registry/registry';

/**
 * `k8s/:plural` (ADR-0023 §1, sidebar links): cluster-scoped kinds go to `k8s/cluster/<plural>`, namespaced (and
 * unknown) plurals to the project last used on this cluster ({@link useLastNamespace}, NS-2) or else all namespaces,
 * keeping the query string.
 */
export function NamespaceRedirect() {
  const { cluster = '', plural = '' } = useParams();
  const { search } = useLocation();
  const [lastNamespace] = useLastNamespace(cluster);
  const model = descriptorForPlural(plural)?.model ?? { plural, namespaced: true };
  return (
    <Navigate
      replace
      to={resourcePath(cluster, model, { namespace: lastNamespace ?? ALL_NAMESPACES, search })}
    />
  );
}
