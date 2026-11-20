import { Button, Content, PageSection, Title } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Credential } from '@/shared/api';
import {
  FilterToolbar,
  TableEmptyRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type SortValue,
} from '@/shared/table';
import { ErrorState } from '@/shared/ui';
import { ENVIRONMENT_OPTIONS } from '../clusters/clusterFilters';
import { useFleetCredentials } from './api';
import { CREDENTIAL_FILTERS, EXPIRY_OPTIONS, matchesCredentialFilters } from './credentialFilters';
import { CredentialExpiryAlert } from './CredentialExpiryAlert';
import { FLEET_CREDENTIAL_COLUMN_COUNT, FleetCredentialRow } from './FleetCredentialRow';

/**
 * Sort keys. `expiry` ascending with nulls last is exactly the server's primary order and the sort is stable, so the
 * initial sort keeps the server order (CRED-7: expiry, then cluster, then name).
 */
const SORT_ACCESSORS: Record<'cluster' | 'expiry', (credential: Credential) => SortValue> = {
  cluster: (credential) => credential.clusterName,
  expiry: (credential) => (credential.expiresAt === null ? null : Date.parse(credential.expiresAt)),
};

const NO_CREDENTIALS: Credential[] = [];

/**
 * `/admin/credentials` — every credential of the fleet in one list, soonest expiry first (CRED-7), under the expiry
 * alert (CRED-8). Filters live in the URL (`?q=&expiry=&env=`) so the alert can link to a pre-filtered view; sorting
 * by expiry or cluster is client-side. Rows link to the cluster's Credentials tab, where rotate/delete live.
 * Lazy-loaded by `routes.tsx`.
 */
export function CredentialsListPage() {
  const { data, error, isPending, refetch } = useFleetCredentials();
  const { values, setText, toggle, clear, clearAll } = useUrlFilters(CREDENTIAL_FILTERS);

  const credentials = data ?? NO_CREDENTIALS;
  const visible = useMemo(
    () => credentials.filter((credential) => matchesCredentialFilters(credential, values)),
    [credentials, values],
  );
  const { sorted, sortProps } = useClientSort(visible, SORT_ACCESSORS, { by: 'expiry', direction: 'asc' });

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Credentials</Title>
        <Content component="p">
          ServiceAccount tokens of every cluster, soonest expiry first. Rotate or delete them on the cluster&apos;s
          Credentials tab.
        </Content>
      </PageSection>
      <PageSection>
        <CredentialExpiryAlert />
        {error && <ErrorState error={error} title="Could not load credentials" onRetry={() => void refetch()} />}
        <FilterToolbar
          ariaLabel="Credentials toolbar"
          search={{
            value: values.q ?? '',
            onChange: (value) => setText('q', value),
            placeholder: 'Filter by cluster, name or service account',
            ariaLabel: 'Search credentials',
          }}
          filters={[
            {
              key: 'expiry',
              label: 'Expiry',
              options: EXPIRY_OPTIONS,
              selected: values.expiry,
              onToggle: (value) => toggle('expiry', value),
              onClear: () => clear('expiry'),
            },
            {
              key: 'env',
              label: 'Environment',
              options: ENVIRONMENT_OPTIONS,
              selected: values.env,
              onToggle: (value) => toggle('env', value),
              onClear: () => clear('env'),
            },
          ]}
          onClearAll={clearAll}
        />
        {!error && (
          <Table aria-label="Credentials" variant="compact">
            <Thead>
              <Tr>
                <Th sort={sortProps('cluster', 0)}>Cluster</Th>
                <Th>Name</Th>
                <Th>Service account</Th>
                <Th>Fingerprint</Th>
                <Th sort={sortProps('expiry', 4)}>Expiry</Th>
                <Th>Grants</Th>
                <Th>Last test</Th>
              </Tr>
            </Thead>
            <Tbody>
              {isPending && <TableSkeletonRows columns={FLEET_CREDENTIAL_COLUMN_COUNT} />}
              {data?.length === 0 && (
                <TableEmptyRow
                  colSpan={FLEET_CREDENTIAL_COLUMN_COUNT}
                  title="No credentials yet"
                  body="Credentials are added per cluster, on the cluster's Credentials tab."
                  actions={<Link to="/admin/clusters">Go to Clusters</Link>}
                />
              )}
              {credentials.length > 0 && sorted.length === 0 && (
                <TableEmptyRow
                  colSpan={FLEET_CREDENTIAL_COLUMN_COUNT}
                  title="No credentials match"
                  body="No credentials match the current filters."
                  icon={SearchIcon}
                  actions={
                    <Button variant="link" onClick={clearAll}>
                      Clear filters
                    </Button>
                  }
                />
              )}
              {sorted.map((credential) => (
                <FleetCredentialRow key={credential.id} credential={credential} />
              ))}
            </Tbody>
          </Table>
        )}
      </PageSection>
    </>
  );
}
