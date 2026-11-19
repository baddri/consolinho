import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Tab,
  TabContent,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, type LinkProps } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import { ErrorState, useToast } from '@/shared/ui';
import { CLUSTER_DETAIL_TABS, useAdminTab, type ClusterDetailTab } from '../adminTabs';
import { useCluster } from './api';
import { ClusterDetailHeader } from './ClusterDetailHeader';
import { ClusterDetailsTab } from './ClusterDetailsTab';
import { clusterDetailPath, plural } from './clusterTarget';
import { CLUSTER_GONE_BODY, clusterGoneTitle, isClusterGone } from './useClusterGone';

/** Path of the clusters list, the way back from a missing or deleted cluster. */
const CLUSTERS_PATH = '/admin/clusters';

/** URL of each tab; tabs are URL segments (FRONTEND.md "Routing"), so switching tabs navigates. */
const tabPath = (name: string, tab: ClusterDetailTab) =>
  tab === 'details' ? clusterDetailPath(name) : `${clusterDetailPath(name)}/${tab}`;

/** Tab titles, also the accessible names of their panels. */
const TAB_TITLES: Record<ClusterDetailTab, string> = {
  details: 'Details',
  credentials: 'Credentials',
  access: 'Access',
};

/** DOM id of a tab's panel, referenced by the tab's `aria-controls`. */
const panelId = (tab: ClusterDetailTab) => `cluster-detail-${tab}-panel`;

/** Router link to the clusters list that PatternFly's `Button` can render as. */
function ClustersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to={CLUSTERS_PATH} />;
}

/** 404 body: no cluster with this name (`Clusters.NotFound`), with a way back to the list. */
function ClusterNotFound({ name }: { name: string }) {
  return (
    <EmptyState titleText={`Cluster ${name} not found`} headingLevel="h2">
      <EmptyStateBody>The cluster may have been deleted, or the name was entered incorrectly.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" component={ClustersLink}>
            Back to Clusters
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}

/** Content of the active tab; only that one is mounted, so later tabs' queries run only when shown. */
function ClusterTabPanel({ cluster, tab }: { cluster: ClusterDetail; tab: ClusterDetailTab }) {
  if (tab === 'details') {
    return <ClusterDetailsTab cluster={cluster} />;
  }
  // Credentials table arrives with T-0036, the grants table with T-0039.
  const body =
    tab === 'credentials'
      ? `${cluster.name} has ${plural(cluster.credentialCount, 'credential')}. The credentials list is coming soon.`
      : `${plural(cluster.grantCount, 'user')} can access ${cluster.name}. The access list is coming soon.`;
  return (
    <EmptyState titleText={TAB_TITLES[tab]} headingLevel="h2">
      <EmptyStateBody>{body}</EmptyStateBody>
    </EmptyState>
  );
}

/**
 * URL-driven Details / Credentials / Access tabs of a loaded cluster: the tab bar sits in a `PageSection
 * type="tabs"` (PF6 page-tabs idiom), the active panel in its own `PageSection` below; selecting a tab navigates.
 */
function ClusterTabs({ cluster, tab }: { cluster: ClusterDetail; tab: ClusterDetailTab }) {
  const navigate = useNavigate();
  return (
    <>
      <PageSection type="tabs">
        <Tabs
          activeKey={tab}
          onSelect={(_event, key) => {
            const next = CLUSTER_DETAIL_TABS.find((candidate) => candidate === key);
            if (next && next !== tab) void navigate(tabPath(cluster.name, next));
          }}
          aria-label="Cluster detail tabs"
        >
          {CLUSTER_DETAIL_TABS.map((key) => (
            <Tab
              key={key}
              eventKey={key}
              title={<TabTitleText>{TAB_TITLES[key]}</TabTitleText>}
              tabContentId={panelId(key)}
            />
          ))}
        </Tabs>
      </PageSection>
      <PageSection>
        <TabContent id={panelId(tab)} eventKey={tab} activeKey={tab} aria-label={TAB_TITLES[tab]}>
          <ClusterTabPanel cluster={cluster} tab={tab} />
        </TabContent>
      </PageSection>
    </>
  );
}

/**
 * Leaving the page once the cluster is gone: after our own delete (the dialog already toasted) or when it turns out
 * to have been deleted meanwhile — a refetch or an action answers 404 — with a "no longer exists" toast (T-0033
 * review). Both paths can fire for one deletion (the action's 404 also refetches the detail), so a ref makes sure
 * the page navigates and toasts once.
 */
function useLeaveDeletedCluster(name: string) {
  const navigate = useNavigate();
  const toast = useToast();
  const left = useRef(false);
  const leave = useCallback(
    (notify: boolean) => {
      if (left.current) return;
      left.current = true;
      if (notify) toast.warning(clusterGoneTitle(name), CLUSTER_GONE_BODY);
      void navigate(CLUSTERS_PATH, { replace: true });
    },
    [name, navigate, toast],
  );
  return {
    onDeleted: useCallback(() => leave(false), [leave]),
    onGone: useCallback(() => leave(true), [leave]),
  };
}

/**
 * `/admin/clusters/:name[/credentials|/access]` — the cluster's home in the admin area (CLU-8): header with labels
 * and the shared Actions menu, then Details, Credentials and Access tabs whose selection comes from the URL
 * (`useAdminTab`). Loading shows skeletons, an unknown name (`Clusters.NotFound`) an empty state with a way back,
 * other errors `ErrorState` with Retry. A cluster that disappears while shown (404 on refetch or action) sends the
 * admin back to the list with a toast. A failed background refetch keeps showing the loaded data. Lazy-loaded by
 * `routes.tsx`.
 */
export function ClusterDetailPage() {
  // The route only matches with a non-empty `:name`.
  const name = useParams().name ?? '';
  const tab = useAdminTab(CLUSTER_DETAIL_TABS);
  const { data: cluster, error, isPending, refetch } = useCluster(name);
  const { onDeleted, onGone } = useLeaveDeletedCluster(name);

  const vanished = cluster !== undefined && isClusterGone(error);
  useEffect(() => {
    if (vanished) onGone();
  }, [vanished, onGone]);

  return (
    <>
      <ClusterDetailHeader
        name={name}
        cluster={cluster}
        isLoading={isPending}
        onDeleted={onDeleted}
        onGone={onGone}
      />
      {isPending && (
        <PageSection>
          <Skeleton height="10rem" screenreaderText="Loading cluster" />
        </PageSection>
      )}
      {error && !cluster && (
        <PageSection>
          {isClusterGone(error) ? (
            <ClusterNotFound name={name} />
          ) : (
            <ErrorState error={error} title="Could not load cluster" onRetry={() => void refetch()} />
          )}
        </PageSection>
      )}
      {cluster && <ClusterTabs cluster={cluster} tab={tab} />}
    </>
  );
}
