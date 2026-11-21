import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, type LinkProps } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import { ErrorState, PageBody, PageTabs, useToast } from '@/shared/ui';
import {
  CLUSTER_DETAIL_TAB_TITLES,
  CLUSTER_DETAIL_TABS,
  detailPageTabs,
  useAdminTab,
  type ClusterDetailTab,
} from '../adminTabs';
import { ClusterCredentialsTab } from '../credentials/ClusterCredentialsTab';
import { ClusterGrantsTab } from '../grants/GrantsTab';
import { useCluster } from './api';
import { ClusterDetailHeader } from './ClusterDetailHeader';
import { ClusterDetailsTab } from './ClusterDetailsTab';
import { clusterDetailPath } from './clusterTarget';
import { CLUSTER_GONE_BODY, clusterGoneTitle, isClusterGone } from './useClusterGone';

/** Path of the clusters list, the way back from a missing or deleted cluster. */
const CLUSTERS_PATH = '/admin/clusters';

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
  if (tab === 'credentials') {
    return <ClusterCredentialsTab cluster={cluster} />;
  }
  return <ClusterGrantsTab cluster={cluster} />;
}

/**
 * URL-driven Details / Credentials / Access tabs of a loaded cluster as `PageTabs` aligned with the heading
 * (`UX.md` §4), then the active tab's content in a `PageBody` labelled by the tab; selecting a tab navigates.
 */
function ClusterTabs({ cluster, tab }: { cluster: ClusterDetail; tab: ClusterDetailTab }) {
  const tabs = detailPageTabs(CLUSTER_DETAIL_TABS, CLUSTER_DETAIL_TAB_TITLES, clusterDetailPath(cluster.name));
  return (
    <>
      <PageTabs tabs={tabs} activeKey={tab} aria-label="Cluster detail tabs" />
      <PageBody role="tabpanel" aria-label={CLUSTER_DETAIL_TAB_TITLES[tab]}>
        <ClusterTabPanel cluster={cluster} tab={tab} />
      </PageBody>
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
 * `/admin/clusters/:name[/credentials|/access]` — the cluster's home in the admin area (CLU-8): `PageHeading` with
 * status, labels and the shared Actions menu, then Details, Credentials and Access tabs whose selection comes from the URL
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
        <PageBody>
          <Skeleton height="10rem" screenreaderText="Loading cluster" />
        </PageBody>
      )}
      {error && !cluster && (
        <PageBody>
          {isClusterGone(error) ? (
            <ClusterNotFound name={name} />
          ) : (
            <ErrorState error={error} title="Could not load cluster" onRetry={() => void refetch()} />
          )}
        </PageBody>
      )}
      {cluster && <ClusterTabs cluster={cluster} tab={tab} />}
    </>
  );
}
