import { NamespaceModel, ProjectModel, useK8sDiscovery, type K8sModel } from '@/shared/k8s';

/**
 * The model namespaces are shown as on `cluster`: Projects where `project.openshift.io` is served (OpenShift), else
 * Namespaces — the same choice as the cluster landing. Used for namespace links and the breadcrumb's first crumb.
 */
export function useNamespaceModel(cluster: string): K8sModel {
  const discovery = useK8sDiscovery(cluster);
  return discovery.isServed(ProjectModel) ? ProjectModel : NamespaceModel;
}
