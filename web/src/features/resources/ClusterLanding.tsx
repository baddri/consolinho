import { Navigate, useParams } from 'react-router';
import { NamespaceModel, PodModel, ProjectModel, useK8sDiscovery } from '@/shared/k8s';
import { ResourcePageSkeleton } from './components/ResourcePageSkeleton';
import { NoNamespacesPage } from './NoNamespacesPage';
import { resourcePath } from './paths';
import { useFallbackTarget } from './useFallbackTarget';

/**
 * Index of `/c/:cluster` (UI-2): the Projects list on OpenShift, Namespaces where `project.openshift.io` isn't served
 * (vanilla Kubernetes). When the token can't list them (NSF-3) it opens the Pods list of the last used or first
 * configured namespace instead, or {@link NoNamespacesPage} when there is none (NSF-4). Waits for discovery and the
 * access check (page skeleton) so it never lands on the wrong page; the check also warms the cache the project
 * selector reads.
 */
export function ClusterLanding() {
  const { cluster = '' } = useParams();
  const discovery = useK8sDiscovery(cluster);
  const { isFallback, target } = useFallbackTarget(cluster, { always: true });
  if (discovery.isPending || isFallback === undefined) return <ResourcePageSkeleton />;
  if (isFallback) {
    if (!target) return <NoNamespacesPage cluster={cluster} />;
    return <Navigate replace to={resourcePath(cluster, PodModel, { namespace: target })} />;
  }
  const model = discovery.isServed(ProjectModel) ? ProjectModel : NamespaceModel;
  return <Navigate replace to={resourcePath(cluster, model)} />;
}
