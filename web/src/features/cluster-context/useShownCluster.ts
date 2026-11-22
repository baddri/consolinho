import type { AccessibleCluster } from '@/shared/api';
import { usePerspective } from '@/shared/routing';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { useIsActiveClusterUnavailable } from './useIsActiveClusterUnavailable';
import { usePreferredCluster } from './usePreferredCluster';

/**
 * The cluster the shell is "about": the one the switcher toggle shows and the Kubernetes theme follows (THEME-1,
 * ADR-0033 §7). The active cluster from the URL, else {@link usePreferredCluster} (pages such as Preferences).
 *
 * `undefined` in the fleet perspective (FLEET-9), on the "Cluster … is not available" page and while the cluster
 * list loads, so the shell stays neutral then. Reads the TanStack Query cache synchronously, so a cluster switch
 * re-renders the shell without a reload (THEME-5).
 */
export function useShownCluster(): AccessibleCluster | undefined {
  const isFleet = usePerspective() === 'fleet';
  const isUnavailable = useIsActiveClusterUnavailable();
  const active = useActiveCluster();
  const preferred = usePreferredCluster();
  const { data: clusters } = useAccessibleClusters();

  if (isFleet || isUnavailable || !clusters) return undefined;
  const name = active ?? preferred;
  return clusters.find((cluster) => cluster.name === name);
}
