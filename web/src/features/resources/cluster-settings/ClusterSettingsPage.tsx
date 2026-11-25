import { Bullseye, EmptyState, EmptyStateBody, PageSection } from '@patternfly/react-core';
import { Outlet, useMatches, useParams } from 'react-router';
import { apiVersionOf, ClusterOperatorModel, ClusterVersionModel, useK8sDiscovery } from '@/shared/k8s';
import { PageBody, PageHeading, PageTabs } from '@/shared/ui';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { clusterSettingsPath } from '../paths';
import type { ClusterSettingsContext } from './clusterSettingsContext';
import { useClusterVersion } from './useClusterVersion';

/** The tabs of Cluster Settings (OCP `ClusterSettingsPage` `pages`; Configuration is backlog, CS-1). */
export type ClusterSettingsTab = 'details' | 'clusteroperators';

/** Route `handle` of a Cluster Settings tab, read by {@link ClusterSettingsPage} to mark the active tab. */
export interface ClusterSettingsRouteHandle {
  settingsTab: ClusterSettingsTab;
}

function isSettingsHandle(handle: unknown): handle is ClusterSettingsRouteHandle {
  return typeof handle === 'object' && handle !== null && 'settingsTab' in handle;
}

const TAB_TITLES: Record<ClusterSettingsTab, string> = {
  details: 'Details',
  clusteroperators: ClusterOperatorModel.labelPlural,
};

/**
 * Administration → Cluster Settings (CS-1, OCP `cluster-settings.tsx` `ClusterSettingsPage`): heading "Cluster
 * Settings" and URL tabs Details (`/settings/cluster`) and ClusterOperators (`/settings/cluster/clusteroperators`),
 * each a child route rendered in the outlet with the live ClusterVersion. A cluster without `config.openshift.io`
 * (Kubernetes) gets the engine's not-served state. Lazy route module.
 */
export function ClusterSettingsPage() {
  const { cluster = '' } = useParams();
  const discovery = useK8sDiscovery(cluster);
  const served = discovery.isServed(ClusterVersionModel);
  const clusterVersion = useClusterVersion(cluster, { enabled: served });
  const handle = useMatches().at(-1)?.handle;
  const tab: ClusterSettingsTab = isSettingsHandle(handle) ? handle.settingsTab : 'details';

  if (!served) {
    return discovery.isPending ? (
      <ResourcePageSkeleton />
    ) : (
      <PageSection>
        <Bullseye>
          <EmptyState titleText={`Cluster Settings aren't available on ${cluster}`} headingLevel="h1">
            <EmptyStateBody>
              This cluster doesn&apos;t serve {apiVersionOf(ClusterVersionModel)}.
            </EmptyStateBody>
          </EmptyState>
        </Bullseye>
      </PageSection>
    );
  }

  const tabs = (Object.keys(TAB_TITLES) as ClusterSettingsTab[]).map((key) => ({
    key,
    title: TAB_TITLES[key],
    to: clusterSettingsPath(cluster, key === 'details' ? undefined : key),
  }));
  const context: ClusterSettingsContext = { cluster, clusterVersion };
  return (
    <>
      <PageHeading title="Cluster Settings" />
      <PageTabs tabs={tabs} activeKey={tab} aria-label="Cluster Settings tabs" />
      {tab === 'details' ? (
        // The Details tab renders its own bordered panes (OCP `PaneBody`s), like the resource Details tab.
        <div role="tabpanel" aria-label={TAB_TITLES[tab]}>
          <Outlet context={context} />
        </div>
      ) : (
        <PageBody role="tabpanel" aria-label={TAB_TITLES[tab]}>
          <Outlet context={context} />
        </PageBody>
      )}
    </>
  );
}
