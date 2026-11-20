import { Navigate, useParams } from 'react-router';
import { NamespaceModel, ProjectModel, useK8sDiscovery } from '@/shared/k8s';
import { ResourcePageSkeleton } from './components/ResourcePageSkeleton';
import { resourcePath } from './paths';

/**
 * Index of `/c/:cluster` (UI-2): the Projects list on OpenShift, Namespaces where `project.openshift.io` isn't served
 * (vanilla Kubernetes). Waits for discovery (page skeleton) so it never lands on the wrong kind.
 */
export function ClusterLanding() {
  const { cluster = '' } = useParams();
  const discovery = useK8sDiscovery(cluster);
  if (discovery.isPending) return <ResourcePageSkeleton />;
  const model = discovery.isServed(ProjectModel) ? ProjectModel : NamespaceModel;
  return <Navigate replace to={resourcePath(cluster, model)} />;
}
