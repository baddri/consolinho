import { useQuery } from '@tanstack/react-query';
import {
  ClusterOperatorModel,
  InfrastructureModel,
  k8sGetPath,
  NodeModel,
  proxyBasePath,
  useK8sGet,
  useK8sList,
  type ClusterOperator,
  type Infrastructure,
  type K8sLiveResult,
  type Node,
} from '@/shared/k8s';

/** Name of the Infrastructure singleton (OCP `details-card.tsx` watches `infrastructures/cluster`). */
const INFRASTRUCTURE_NAME = 'cluster';

/** `GET /version` of the API server (only the field the dashboard shows). */
export interface KubernetesVersionInfo {
  gitVersion?: string;
}

/**
 * The live `infrastructures/cluster` of `cluster` (API address, platform) for the Details card. `enabled: false` on
 * clusters without `config.openshift.io`.
 */
export function useInfrastructure(cluster: string, enabled: boolean): K8sLiveResult<Infrastructure> {
  return useK8sGet<Infrastructure>(cluster, InfrastructureModel, undefined, INFRASTRUCTURE_NAME, { enabled });
}

/**
 * The API server's `GET /version` (Kubernetes clusters' Details row and health input). Not a resource, so a plain
 * query under the cluster's key; the version only changes with an upgrade, hence the long `staleTime`.
 */
export function useKubernetesVersion(cluster: string, enabled: boolean) {
  return useQuery({
    queryKey: ['k8s', cluster, 'version'] as const,
    queryFn: ({ signal }) => k8sGetPath<KubernetesVersionInfo>(`${proxyBasePath(cluster)}/version`, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Live ClusterOperators (Status card); same cache entry as the Cluster Settings ClusterOperators tab. */
export function useClusterOperators(cluster: string, enabled: boolean): K8sLiveResult<ClusterOperator[]> {
  return useK8sList<ClusterOperator>(cluster, ClusterOperatorModel, { enabled });
}

/** Live Nodes (Status card health input); same cache entry as the Nodes list. */
export function useNodes(cluster: string, enabled: boolean): K8sLiveResult<Node[]> {
  return useK8sList<Node>(cluster, NodeModel, { enabled });
}
