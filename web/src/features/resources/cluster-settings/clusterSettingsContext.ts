import { useOutletContext } from 'react-router';
import type { ClusterVersion, K8sLiveResult } from '@/shared/k8s';

/** What `ClusterSettingsPage` hands its tabs through the router outlet. */
export interface ClusterSettingsContext {
  cluster: string;
  /** The live ClusterVersion `version`; each tab renders its own loading / error state from it. */
  clusterVersion: K8sLiveResult<ClusterVersion>;
}

/** The Cluster Settings page context inside one of its tabs. */
export function useClusterSettings(): ClusterSettingsContext {
  return useOutletContext<ClusterSettingsContext>();
}
