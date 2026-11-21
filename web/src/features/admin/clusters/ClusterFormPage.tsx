import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { Link, useParams, type LinkProps } from 'react-router';
import { isApiError } from '@/shared/api';
import { ErrorState, PageBody, PageHeading, type BreadcrumbCrumb } from '@/shared/ui';
import { useCluster } from './api';
import { ClusterForm } from './form/ClusterForm';

/** Router link to the clusters list that PatternFly's `Button` can render as. */
function ClustersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/admin/clusters" />;
}

/** Breadcrumb `Clusters › <current page>` of both modes (`UX.md` §3). */
const crumbs = (current: string): BreadcrumbCrumb[] => [{ label: 'Clusters', to: '/admin/clusters' }, { label: current }];

/**
 * `/admin/clusters/new` (register) and `/admin/clusters/:name/edit` (edit) — one form (T-0034); the mode follows from
 * whether the route has a `:name`. Lazy-loaded by `routes.tsx`.
 */
export function ClusterFormPage() {
  const { name } = useParams();
  return name === undefined ? <RegisterClusterPage /> : <EditClusterPage name={name} />;
}

/** Register mode: an empty form, enabled by default (CLU-1). */
function RegisterClusterPage() {
  return (
    <>
      <PageHeading breadcrumbs={crumbs('Register cluster')} title="Register cluster" />
      <PageBody>
        <ClusterForm />
      </PageBody>
    </>
  );
}

/**
 * Edit mode (CLU-4): loads the cluster (skeleton / 404 / error with retry), then renders the form seeded with its
 * values and `version`. The form mounts once with those values; background refetches never overwrite typed input —
 * only "Reload latest values" after a conflict does.
 */
function EditClusterPage({ name }: { name: string }) {
  const { data: cluster, error, isPending, refetch } = useCluster(name);
  return (
    <>
      <PageHeading breadcrumbs={crumbs('Edit cluster')} title={`Edit ${name}`} />
      <PageBody>
        {isPending && <Skeleton height="20rem" screenreaderText="Loading cluster" />}
        {error &&
          !cluster &&
          (isApiError(error) && error.status === 404 ? (
            <EmptyState titleText={`Cluster ${name} not found`} headingLevel="h2">
              <EmptyStateBody>It may have been deleted by another administrator.</EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" component={ClustersLink}>
                    Back to Clusters
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <ErrorState error={error} title="Could not load cluster" onRetry={() => void refetch()} />
          ))}
        {cluster && <ClusterForm cluster={cluster} onReload={async () => (await refetch()).data} />}
      </PageBody>
    </>
  );
}
