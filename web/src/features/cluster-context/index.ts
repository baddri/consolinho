// Public API of the cluster-context feature (SW-1..10): the user's clusters, the sidebar switcher, the environment
// band, the `/` landing redirect and the `/c/:cluster` gate, the URL-derived active cluster, and the project selector
// with the remembered project per cluster (NS-1..4).
export { ClusterGate } from './ClusterGate';
export { ClusterSwitcher } from './ClusterSwitcher';
export { clusterSwitchPath } from './clusterSwitchPath';
export { EnvironmentBanner } from './EnvironmentBanner';
export { LandingRedirect } from './LandingRedirect';
export { NamespaceSelector, type NamespaceSelectorProps } from './NamespaceSelector';
export { NoClustersPage } from './NoClustersPage';
export { accessibleClustersQueryKey, useAccessibleClusters } from './useAccessibleClusters';
export { useActiveCluster } from './useActiveCluster';
export { useLastCluster } from './useLastCluster';
export { useLastNamespace } from './useLastNamespace';
export { useIsActiveClusterUnavailable } from './useIsActiveClusterUnavailable';
export { usePreferredCluster } from './usePreferredCluster';
export { useRecentClusters, type RecentClusters } from './useRecentClusters';
export { isDefaultProject, useShowDefaultProjects } from './useShowDefaultProjects';
