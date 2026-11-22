import { Flex, FlexItem } from '@patternfly/react-core';
import { ActionsColumn } from '@patternfly/react-table';
import type { ClusterListItem } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { EnvironmentLabel, type DataViewColumn } from '@/shared/ui';
import { AdminResourceLink } from '../AdminResourceLink';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import { clusterDetailPath } from './clusterTarget';
import { ClusterTokenExpiryStatus } from './ClusterTokenExpiryStatus';
import { LastTestCell } from './LastTestCell';
import { TlsModeLabel } from './TlsModeLabel';
import { useClusterActions } from './useClusterActions';

/**
 * Columns of the clusters list (CLU-7) for `ConsoleDataView`: Name (kind badge + link) first; Display name and API URL
 * hide below `2xl` rather than squeezing the table at 1280 (`UX.md` §5); TLS and Users are additional columns
 * ("Manage columns", as OCP's pod Node/IP), so the table fits the page up to 1920 (both are on the details page).
 */
export const CLUSTER_COLUMNS: DataViewColumn<ClusterListItem>[] = [
  {
    id: 'name',
    title: 'Name',
    type: 'name',
    cell: (cluster) => (
      <AdminResourceLink kind="Cluster" name={cluster.name} to={clusterDetailPath(cluster.name)} />
    ),
    sortValue: (cluster) => cluster.name,
  },
  {
    id: 'displayName',
    title: 'Display name',
    visibility: LOW_PRIORITY_COLUMN,
    cell: (cluster) => cluster.displayName,
    sortValue: (cluster) => cluster.displayName,
  },
  {
    id: 'environment',
    title: 'Environment',
    cell: (cluster) => <EnvironmentLabel environment={cluster.environment} isCompact />,
    sortValue: (cluster) => cluster.environment,
  },
  {
    id: 'apiUrl',
    title: 'API URL',
    visibility: LOW_PRIORITY_COLUMN,
    // A URL can't wrap: start wide enough for a typical `https://api.<cluster>.<domain>:6443`.
    width: 300,
    cell: (cluster) => cluster.apiUrl,
  },
  {
    id: 'status',
    title: 'Status',
    cell: (cluster) => <ClusterStatusLabel isEnabled={cluster.isEnabled} />,
    sortValue: (cluster) => (cluster.isEnabled ? 'Enabled' : 'Disabled'),
  },
  {
    id: 'tls',
    title: 'TLS',
    defaultVisible: false,
    cell: (cluster) => <TlsModeLabel tlsMode={cluster.tlsMode} />,
  },
  {
    id: 'credentials',
    title: 'Credentials',
    cell: (cluster) => (
      <Flex
        spaceItems={{ default: 'spaceItemsSm' }}
        flexWrap={{ default: 'nowrap' }}
        alignItems={{ default: 'alignItemsCenter' }}
      >
        <FlexItem>{cluster.credentialCount}</FlexItem>
        <FlexItem className="pf-v6-u-text-nowrap">
          <ClusterTokenExpiryStatus status={cluster.worstCredentialExpiryStatus} />
        </FlexItem>
      </Flex>
    ),
    sortValue: (cluster) => cluster.credentialCount,
  },
  {
    id: 'users',
    title: 'Users',
    defaultVisible: false,
    cell: (cluster) => cluster.grantCount,
    sortValue: (cluster) => cluster.grantCount,
  },
  {
    id: 'lastTest',
    title: 'Last test',
    cell: (cluster) => <LastTestCell lastTest={cluster.lastTest} credentialName={cluster.lastTestCredentialName} />,
    sortValue: (cluster) => (cluster.lastTest === null ? null : Date.parse(cluster.lastTest.testedAt)),
  },
];

/**
 * The kebab of one clusters-list row: `useClusterActions` (Edit, Enable/Disable, Delete), with their dialog rendered
 * next to it (a portalled modal) so it confirms with the row's `version`.
 */
export function ClusterRowActions({ cluster }: { cluster: ClusterListItem }) {
  const { items, dialog } = useClusterActions(cluster);
  return (
    <>
      <ActionsColumn items={items} />
      {dialog}
    </>
  );
}
