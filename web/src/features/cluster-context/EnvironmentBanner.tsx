import { Banner } from '@patternfly/react-core';
import type { AccessibleCluster } from '@/shared/api';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';

/** Band style and wording per environment; development gets no band. */
const BANDS: Partial<
  Record<AccessibleCluster['environment'], { status: 'danger' | 'warning'; text: string }>
> = {
  production: { status: 'danger', text: 'Production cluster' },
  staging: { status: 'warning', text: 'Staging cluster' },
};

/**
 * Coloured band under the masthead that keeps production (red) and staging (orange) clusters impossible to miss
 * (SW-10), e.g. "Production cluster prod-eu-1". Renders nothing outside `/c/:cluster`, for development clusters and
 * for clusters not in the user's list (the gate shows "not available" there). Passed to PF `Page` as `banner`.
 */
export function EnvironmentBanner() {
  const activeCluster = useActiveCluster();
  const { data: clusters } = useAccessibleClusters();
  const cluster = activeCluster ? clusters?.find((candidate) => candidate.name === activeCluster) : undefined;
  const band = cluster ? BANDS[cluster.environment] : undefined;
  if (!cluster || !band) return null;
  return (
    <Banner status={band.status}>
      {band.text} {cluster.name}
    </Banner>
  );
}
