import { Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useMemo } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { Credential } from '@/shared/api';
import { ConsoleDataView, DataViewTextFilter, ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { ENVIRONMENT_OPTIONS } from '../clusters/clusterFilters';
import { useAdminListFilters } from '../useAdminListFilters';
import { useFleetCredentials } from './api';
import { CREDENTIAL_FILTERS, EXPIRY_OPTIONS, matchesCredentialFilters } from './credentialFilters';
import { CredentialExpiryAlert } from './CredentialExpiryAlert';
import { FLEET_CREDENTIAL_COLUMNS } from './fleetCredentialColumns';

/** Filter elements (OCP `ConsoleDataView`): Name, then the attribute filters. Module-level, so never recreated. */
const FILTER_NODES = [
  <DataViewTextFilter key="q" filterId="q" title="Name" placeholder="Filter by name" />,
  <DataViewCheckboxFilter
    key="expiry"
    filterId="expiry"
    title="Expiry"
    placeholder="Filter by expiry"
    options={EXPIRY_OPTIONS}
  />,
  <DataViewCheckboxFilter
    key="env"
    filterId="env"
    title="Environment"
    placeholder="Filter by environment"
    options={ENVIRONMENT_OPTIONS}
  />,
];

/** Initial sort: soonest expiry first, the server's order (CRED-7). */
const DEFAULT_SORT = { by: 'expiry', direction: 'asc' } as const;

const idOf = (credential: Credential) => credential.id;

/** Router link to the clusters list that PatternFly's `Button` can render as. */
function ClustersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/admin/clusters" />;
}

/** No credential anywhere yet: where credentials are added, with a way there (OCP custom list empty state). */
function NoCredentials() {
  return (
    <EmptyState titleText="No Credentials found" headingLevel="h2">
      <EmptyStateBody>Credentials are added per cluster, on the cluster&apos;s Credentials tab.</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="link" component={ClustersLink}>
            Go to Clusters
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
}

/**
 * `/admin/credentials` — every credential of the fleet in one list, soonest expiry first (CRED-7), under the expiry
 * alert (CRED-8), as an OCP list page (`UX.md` §5, `ConsoleDataView`). Filters live in the URL (`?q=&expiry=&env=`;
 * Name searches cluster, credential name and service account) so the alert can link to a pre-filtered view. Rows link
 * to the cluster's Credentials tab, where rotate/delete live. Lazy-loaded by `routes.tsx`.
 */
export function CredentialsListPage() {
  const { data, error, isPending, refetch } = useFleetCredentials();
  const { values, filterValues, onFilterChange, clearAll, isFiltered } = useAdminListFilters(CREDENTIAL_FILTERS);

  const filtered = useMemo(
    () => (data ?? []).filter((credential) => matchesCredentialFilters(credential, values)),
    [data, values],
  );

  return (
    <>
      <PageHeading
        title="Credentials"
        subtitle={
          "ServiceAccount tokens of every cluster, soonest expiry first. Rotate or delete them on the cluster's " +
          'Credentials tab.'
        }
      />
      <PageBody>
        <CredentialExpiryAlert />
        {data?.length === 0 ? (
          <NoCredentials />
        ) : (
          <ConsoleDataView
            id="admin-credentials"
            label="Credentials"
            data={data}
            filteredData={filtered}
            loaded={!isPending}
            error={
              error &&
              !data && <ErrorState error={error} title="Could not load credentials" onRetry={() => void refetch()} />
            }
            columns={FLEET_CREDENTIAL_COLUMNS}
            getRowId={idOf}
            defaultSort={DEFAULT_SORT}
            filterNodes={FILTER_NODES}
            filterValues={filterValues}
            onFilterChange={onFilterChange}
            onClearAllFilters={clearAll}
            isFiltered={isFiltered}
          />
        )}
      </PageBody>
    </>
  );
}
