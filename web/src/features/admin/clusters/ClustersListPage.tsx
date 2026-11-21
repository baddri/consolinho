import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { ClusterListItem } from '@/shared/api';
import {
  FilterToolbar,
  LOW_PRIORITY_COLUMN,
  TableEmptyRow,
  TableNoMatchRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type SortValue,
} from '@/shared/table';
import { ActionButton, ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { CredentialExpiryAlert } from '../credentials/CredentialExpiryAlert';
import { useAdminAccess } from '../useAdminAccess';
import { useClusters } from './api';
import {
  CLUSTER_FILTERS,
  CLUSTER_STATUS_OPTIONS,
  ENVIRONMENT_OPTIONS,
  matchesClusterFilters,
} from './clusterFilters';
import { CLUSTER_COLUMN_COUNT, CLUSTER_COLUMN_VISIBILITY, ClusterRow } from './ClusterRow';
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
 * The heading's "Register cluster" opens the form (T-0034); each row's kebab offers Edit, Enable/Disable (CLU-5)
 * and Delete (CLU-6). For read-only admins they stay visible but aria-disabled with the reason (ADM-2).
 * TLS and Users hide below `2xl` so the compact table fits 1280 (`UX.md` §5).
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
      <PageHeading
        title="Clusters"
        subtitle={`OpenShift clusters ${PRODUCT_NAME} can connect to, with their credentials and users.`}
        actions={registerButton}
      />
      <PageBody>
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
        />
        <Table aria-label="Clusters" variant="compact">
          <Thead>
            <Tr>
              <Th modifier="nowrap" sort={sortProps('name', 0)}>
                Name
              </Th>
              <Th modifier="nowrap">Environment</Th>
              <Th modifier="nowrap">API URL</Th>
              <Th modifier="nowrap">Status</Th>
              <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN}>
                TLS
              </Th>
              <Th modifier="nowrap">Credentials</Th>
              <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN}>
                Users
              </Th>
              <Th modifier="nowrap">Last test</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {isPending && <TableSkeletonRows columns={CLUSTER_COLUMN_COUNT} columnVisibility={CLUSTER_COLUMN_VISIBILITY} />}
            {data?.length === 0 && (
              <TableEmptyRow
                colSpan={CLUSTER_COLUMN_COUNT}
                title="No clusters found"
                body="You need the cluster's API URL, its CA bundle (or system trust) and a ServiceAccount token."
                actions={registerButton}
              />
            )}
            {clusters.length > 0 && sorted.length === 0 && (
              <TableNoMatchRow colSpan={CLUSTER_COLUMN_COUNT} onClearAll={clearAll} />
            )}
            {sorted.map((cluster) => (
              <ClusterRow key={cluster.name} cluster={cluster} />
            ))}
          </Tbody>
        </Table>
      </PageBody>
    </>
  );
}
