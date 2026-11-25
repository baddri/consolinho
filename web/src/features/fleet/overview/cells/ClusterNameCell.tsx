import { Flex, FlexItem } from '@patternfly/react-core';
import { Link } from 'react-router';
import type { AccessibleCluster } from '@/shared/api';
import { ClusterTypeIcon } from '@/shared/ui';
import { clusterOverviewPath } from '@/features/resources';
import { SecondaryLine } from './SecondaryLine';

/** Props for {@link ClusterNameCell}. */
export interface ClusterNameCellProps {
  cluster: AccessibleCluster;
  /** Called when the link is followed, to record the cluster as recently used (the switcher's `remember`). */
  onOpen: (name: string) => void;
}

/**
 * Name (FLT-2/FLT-8): cluster type icon + display name linking to the cluster's Overview, which switches cluster
 * exactly like the switcher (the page passes `useRecentClusters().remember`); the cluster name underneath, subtle,
 * when it differs from the display name.
 */
export function ClusterNameCell({ cluster, onOpen }: ClusterNameCellProps) {
  return (
    <>
      <Flex
        gap={{ default: 'gapSm' }}
        alignItems={{ default: 'alignItemsCenter' }}
        flexWrap={{ default: 'nowrap' }}
      >
        <FlexItem>
          <ClusterTypeIcon distribution={cluster.distribution} />
        </FlexItem>
        <FlexItem>
          <Link to={clusterOverviewPath(cluster.name)} onClick={() => onOpen(cluster.name)}>
            {cluster.displayName}
          </Link>
        </FlexItem>
      </Flex>
      {cluster.name !== cluster.displayName && <SecondaryLine text={cluster.name} />}
    </>
  );
}
