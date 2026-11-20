import { Button, Content, PageSection, Title } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { ClusterListItem } from '@/shared/api';
import {
  FilterToolbar,
  TableEmptyRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type SortValue,
} from '@/shared/table';
import { ActionButton, ErrorState } from '@/shared/ui';
import { CredentialExpiryAlert } from '../credentials/CredentialExpiryAlert';
import { useAdminAccess } from '../useAdminAccess';
import { useClusters } from './api';
import {
  CLUSTER_FILTERS,
  CLUSTER_STATUS_OPTIONS,
  ENVIRONMENT_OPTIONS,
  matchesClusterFilters,
} from './clusterFilters';
import { CLUSTER_COLUMN_COUNT, ClusterRow } from './ClusterRow';
import { PRODUCT_NAME } from '@/shared/branding';

/** Path of the register form (T-0034). */
const REGISTER_PATH = '/admin/clusters/new';

const SORT_ACCESSORS: Record<'name', (cluster: ClusterListItem) => SortValue> = {
  name: (cluster) => cluster.name,
};

const NO_CLUSTERS: ClusterListItem[] = [];

/**
 * `/admin/clusters` — the fleet view of every registered cluster (CLU-7): environment, API URL, status, TLS mode,
 * credentials with worst token expiry, user count and newest connection test. Filters live in the URL
 * (`?q=&env=&status=`); sorting by name is client-side (≈40–100 rows, no pagination or virtualization needed).
 *
 * The toolbar's "Register cluster" opens the form (T-0034); each row's kebab offers Edit, Enable/Disable (CLU-5)
 * and Delete (CLU-6). For read-only admins they stay visible but aria-disabled with the reason (ADM-2).
 * `CredentialExpiryAlert` above the toolbar warns about expired or soon-expiring tokens (CRED-8).
 * Lazy-loaded by `routes.tsx`.
 */
export function ClustersListPage() {
  const { data, error, isPending, refetch } = useClusters();
  const { readOnlyReason } = useAdminAccess();
  const navigate = useNavigate();
  const { values, setText, toggle, clear, clearAll } = useUrlFilters(CLUSTER_FILTERS);

  const clusters = data ?? NO_CLUSTERS;
  const visible = useMemo(
    () => clusters.filter((cluster) => matchesClusterFilters(cluster, values)),
    [clusters, values],
  );
  const { sorted, sortProps } = useClientSort(visible, SORT_ACCESSORS, { by: 'name', direction: 'asc' });

  const registerButton = (
    <ActionButton disabledReason={readOnlyReason} onClick={() => void navigate(REGISTER_PATH)}>
      Register cluster
    </ActionButton>
  );

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Clusters</Title>
        <Content component="p">
          OpenShift clusters {PRODUCT_NAME} can connect to, with their credentials and users.
        </Content>
      </PageSection>
      <PageSection>
        <CredentialExpiryAlert />
        {error && <ErrorState error={error} title="Could not load clusters" onRetry={() => void refetch()} />}
        <FilterToolbar
          ariaLabel="Clusters toolbar"
          search={{
            value: values.q ?? '',
            onChange: (value) => setText('q', value),
            placeholder: 'Filter by name, display name or API URL',
            ariaLabel: 'Search clusters',
          }}
          filters={[
            {
              key: 'env',
              label: 'Environment',
              options: ENVIRONMENT_OPTIONS,
              selected: values.env,
              onToggle: (value) => toggle('env', value),
              onClear: () => clear('env'),
            },
            {
              key: 'status',
              label: 'Status',
              options: CLUSTER_STATUS_OPTIONS,
              selected: values.status,
              onToggle: (value) => toggle('status', value),
              onClear: () => clear('status'),
            },
          ]}
          onClearAll={clearAll}
          actions={registerButton}
        />
        <Table aria-label="Clusters" variant="compact">
          <Thead>
            <Tr>
              <Th sort={sortProps('name', 0)}>Name</Th>
              <Th>Environment</Th>
              <Th>API URL</Th>
              <Th>Status</Th>
              <Th>TLS</Th>
              <Th>Credentials</Th>
              <Th>Users</Th>
              <Th>Last test</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {isPending && <TableSkeletonRows columns={CLUSTER_COLUMN_COUNT} />}
            {data?.length === 0 && (
              <TableEmptyRow
                colSpan={CLUSTER_COLUMN_COUNT}
                title="No clusters registered"
                body="You need the cluster's API URL, its CA bundle (or system trust) and a ServiceAccount token."
                actions={registerButton}
              />
            )}
            {clusters.length > 0 && sorted.length === 0 && (
              <TableEmptyRow
                colSpan={CLUSTER_COLUMN_COUNT}
                title="No clusters match"
                body="No clusters match the current filters."
                icon={SearchIcon}
                actions={
                  <Button variant="link" onClick={clearAll}>
                    Clear filters
                  </Button>
                }
              />
            )}
            {sorted.map((cluster) => (
              <ClusterRow key={cluster.name} cluster={cluster} />
            ))}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
}
