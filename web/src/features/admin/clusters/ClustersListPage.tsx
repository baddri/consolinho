import { EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { ClusterListItem } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import { ActionButton, ConsoleDataView, DataViewTextFilter, ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { CredentialExpiryAlert } from '../credentials/CredentialExpiryAlert';
import { useAdminAccess } from '../useAdminAccess';
import { useAdminListFilters } from '../useAdminListFilters';
import { useClusters } from './api';
import { CLUSTER_COLUMNS, ClusterRowActions } from './clusterColumns';
import {
  CLUSTER_FILTERS,
  CLUSTER_STATUS_OPTIONS,
  ENVIRONMENT_OPTIONS,
  matchesClusterFilters,
} from './clusterFilters';

/** Path of the register form (T-0034). */
const REGISTER_PATH = '/admin/clusters/new';

/** Filter elements (OCP `ConsoleDataView`): Name, then the attribute filters. Module-level, so never recreated. */
const FILTER_NODES = [
  <DataViewTextFilter key="q" filterId="q" title="Name" placeholder="Filter by name" />,
  <DataViewCheckboxFilter
    key="env"
    filterId="env"
    title="Environment"
    placeholder="Filter by environment"
    options={ENVIRONMENT_OPTIONS}
  />,
  <DataViewCheckboxFilter
    key="status"
    filterId="status"
    title="Status"
    placeholder="Filter by status"
    options={CLUSTER_STATUS_OPTIONS}
  />,
];

const nameOf = (cluster: ClusterListItem) => cluster.name;

/**
 * No cluster registered yet: OCP's custom list empty state (`user.tsx` `NoDataEmptyMsg`) with what registering needs
 * and the register button.
 */
function NoClusters({ registerButton }: { registerButton: ReactNode }) {
  return (
    <EmptyState titleText="No Clusters found" headingLevel="h2">
      <EmptyStateBody>
        You need the cluster&apos;s API URL, its CA bundle (or system trust) and a ServiceAccount token.
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>{registerButton}</EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}

/**
 * `/admin/clusters` — the fleet view of every registered cluster (CLU-7): environment, API URL, status, TLS mode,
 * credentials with their token expiry, user count and newest connection test, as an OCP list page (`UX.md` §5,
 * `ConsoleDataView`). Filters live in the URL (`?q=&env=&status=`; Name searches name, display name and API URL).
 *
 * The heading's "Register cluster" opens the form (T-0034); each row's kebab offers Edit, Enable/Disable (CLU-5)
 * and Delete (CLU-6). For read-only admins they stay visible but aria-disabled with the reason (ADM-2).
 * `CredentialExpiryAlert` above the list warns about expired or soon-expiring tokens (CRED-8).
 * Lazy-loaded by `routes.tsx`.
 */
export function ClustersListPage() {
  const { data, error, isPending, refetch } = useClusters();
  const { readOnlyReason } = useAdminAccess();
  const navigate = useNavigate();
  const { values, filterValues, onFilterChange, clearAll, isFiltered } = useAdminListFilters(CLUSTER_FILTERS);

  const filtered = useMemo(
    () => (data ?? []).filter((cluster) => matchesClusterFilters(cluster, values)),
    [data, values],
  );
  const rowActions = useCallback((cluster: ClusterListItem) => <ClusterRowActions cluster={cluster} />, []);

  const registerButton = (
    <ActionButton disabledReason={readOnlyReason} onClick={() => void navigate(REGISTER_PATH)}>
      Register cluster
    </ActionButton>
  );

  return (
    <>
      <PageHeading
        title="Clusters"
        subtitle={`OpenShift clusters ${PRODUCT_NAME} can connect to, with their credentials and users.`}
        actions={registerButton}
      />
      <PageBody>
        <CredentialExpiryAlert />
        {data?.length === 0 ? (
          <NoClusters registerButton={registerButton} />
        ) : (
          <ConsoleDataView
            id="admin-clusters"
            label="Clusters"
            data={data}
            filteredData={filtered}
            loaded={!isPending}
            error={
              error &&
              !data && <ErrorState error={error} title="Could not load clusters" onRetry={() => void refetch()} />
            }
            columns={CLUSTER_COLUMNS}
            getRowId={nameOf}
            filterNodes={FILTER_NODES}
            filterValues={filterValues}
            onFilterChange={onFilterChange}
            onClearAllFilters={clearAll}
            isFiltered={isFiltered}
            rowActions={rowActions}
          />
        )}
      </PageBody>
    </>
  );
}
