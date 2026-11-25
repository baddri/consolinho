import { Grid, GridItem, PageSection } from '@patternfly/react-core';
import { useParams } from 'react-router';
import { ClusterServiceVersionModel, ClusterVersionModel, useK8sDiscovery } from '@/shared/k8s';
import { PageHeading, PageTabs } from '@/shared/ui';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { clusterOverviewPath } from '../paths';
import { ActivityCard } from './ActivityCard';
import { DetailsCard } from './DetailsCard';
import { InventoryCard } from './InventoryCard';
import styles from './Overview.module.css';
import { StatusCard } from './StatusCard';

/**
 * Home → Overview (OVW-1, OCP `cluster-dashboard.tsx` + `DashboardGrid`): Details and Cluster inventory on the left
 * (3 columns), Status in the middle (6), Activity on the right (3). Like OCP, the switch depends on the dashboard's own
 * width (> 992px), not the viewport, so with the sidebar open at 1280px it is one column with Status first. Under the
 * heading OCP's tab row with its single "Cluster" tab (`dashboards.tsx` `HorizontalNav`). Waits for discovery, which
 * decides OpenShift (ClusterVersion served) vs plain Kubernetes rows.
 */
export function ClusterOverviewPage() {
  const cluster = useParams().cluster ?? '';
  const discovery = useK8sDiscovery(cluster);
  if (discovery.isPending) return <ResourcePageSkeleton />;
  const isOpenShift = discovery.isServed(ClusterVersionModel);

  return (
    <>
      <PageHeading title="Overview" />
      <PageTabs
        tabs={[{ key: 'cluster', title: 'Cluster', to: clusterOverviewPath(cluster) }]}
        activeKey="cluster"
        aria-label="Overview tabs"
      />
      <PageSection className={styles.dashboard}>
        <Grid hasGutter className={styles.grid}>
          <GridItem className={styles.mainColumn}>
            <Grid hasGutter className={styles.grid}>
              <GridItem>
                <StatusCard
                  cluster={cluster}
                  isOpenShift={isOpenShift}
                  isOlmServed={discovery.isServed(ClusterServiceVersionModel)}
                />
              </GridItem>
            </Grid>
          </GridItem>
          <GridItem className={styles.leftColumn}>
            <Grid hasGutter className={styles.grid}>
              <GridItem>
                <DetailsCard cluster={cluster} isOpenShift={isOpenShift} />
              </GridItem>
              <GridItem>
                <InventoryCard cluster={cluster} isServed={(model) => discovery.isServed(model)} />
              </GridItem>
            </Grid>
          </GridItem>
          <GridItem className={styles.rightColumn}>
            <Grid hasGutter className={styles.grid}>
              <GridItem>
                <ActivityCard cluster={cluster} isOpenShift={isOpenShift} />
              </GridItem>
            </Grid>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
}
