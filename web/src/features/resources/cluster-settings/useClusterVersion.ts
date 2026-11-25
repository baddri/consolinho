import { ClusterVersionModel, useK8sGet, type ClusterVersion, type K8sLiveResult } from '@/shared/k8s';

/** Name of the ClusterVersion singleton (OCP `useK8sWatchResource({ kind: ClusterVersion, name: 'version' })`). */
export const CLUSTER_VERSION_NAME = 'version';

/**
 * The live ClusterVersion `version` of `cluster` (get + watch, key `['k8s', cluster, 'get', …, 'version']`), shared by
 * Cluster Settings and the cluster Overview (T-0336) so both read one query. `enabled: false` where discovery says the
 * cluster has no `config.openshift.io` (Kubernetes clusters).
 */
export function useClusterVersion(
  cluster: string,
  opts: { enabled?: boolean } = {},
): K8sLiveResult<ClusterVersion> {
  return useK8sGet<ClusterVersion>(cluster, ClusterVersionModel, undefined, CLUSTER_VERSION_NAME, opts);
}
