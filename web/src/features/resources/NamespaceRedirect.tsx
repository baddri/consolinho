import { Navigate, useLocation, useParams } from 'react-router';
import { ALL_NAMESPACES, resourcePath } from './paths';
import { descriptorForPlural } from './registry/registry';

/**
 * `k8s/:plural` (ADR-0023 §1, sidebar links): cluster-scoped kinds go to `k8s/cluster/<plural>`, namespaced (and
 * unknown) plurals to all namespaces, keeping the query string. T-0074 adds the remembered project of the cluster.
 */
export function NamespaceRedirect() {
  const { cluster = '', plural = '' } = useParams();
  const { search } = useLocation();
  const model = descriptorForPlural(plural)?.model ?? { plural, namespaced: true };
  return <Navigate replace to={resourcePath(cluster, model, { namespace: ALL_NAMESPACES, search })} />;
}
