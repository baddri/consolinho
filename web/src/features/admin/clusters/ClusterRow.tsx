import { Flex, FlexItem } from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { ClusterListItem } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import { clusterDetailPath } from './clusterTarget';
import { LastTestCell } from './LastTestCell';
import { TlsModeLabel } from './TlsModeLabel';
import { useClusterActions } from './useClusterActions';
import { WorstExpiryStatus } from './WorstExpiryStatus';

/** Number of columns of the clusters table, including the trailing actions column. */
export const CLUSTER_COLUMN_COUNT = 9;

/** Responsive columns by index (API URL, TLS, Users), for the loading skeleton. */
export const CLUSTER_COLUMN_VISIBILITY = {
  2: LOW_PRIORITY_COLUMN,
  4: LOW_PRIORITY_COLUMN,
  6: LOW_PRIORITY_COLUMN,
} as const;

/** PatternFly utility class for secondary text (display names, disabled rows). */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/**
 * One row of the clusters list (CLU-7); API URL, TLS and Users share the header's `LOW_PRIORITY_COLUMN` (hidden below
 * 2xl rather than truncated). The name cell never wraps (display name as a one-line subtitle, OCP name column).
 * Disabled clusters render in subtle text next to their "Disabled" status. The trailing kebab offers
 * `useClusterActions` (Edit, Enable/Disable, Delete); their dialog renders in the row (it is a portalled modal) and
 * confirms with the row's `version`.
 */
export function ClusterRow({ cluster }: { cluster: ClusterListItem }) {
  const { items, dialog } = useClusterActions(cluster);
  return (
    <Tr className={cluster.isEnabled ? undefined : SUBTLE}>
      <Td dataLabel="Name" modifier="nowrap">
        <Link to={clusterDetailPath(cluster.name)}>{cluster.name}</Link>
        {cluster.displayName !== cluster.name && <div className={SUBTLE}>{cluster.displayName}</div>}
      </Td>
      <Td dataLabel="Environment">
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </Td>
      <Td dataLabel="API URL" visibility={LOW_PRIORITY_COLUMN}>
        {cluster.apiUrl}
      </Td>
      <Td dataLabel="Status">
        <ClusterStatusLabel isEnabled={cluster.isEnabled} />
      </Td>
      <Td dataLabel="TLS" visibility={LOW_PRIORITY_COLUMN}>
        <TlsModeLabel tlsMode={cluster.tlsMode} />
      </Td>
      <Td dataLabel="Credentials" modifier="nowrap">
        <Flex
          spaceItems={{ default: 'spaceItemsSm' }}
          flexWrap={{ default: 'nowrap' }}
          alignItems={{ default: 'alignItemsCenter' }}
        >
          <FlexItem>{cluster.credentialCount}</FlexItem>
          <FlexItem>
            <WorstExpiryStatus status={cluster.worstCredentialExpiryStatus} />
          </FlexItem>
        </Flex>
      </Td>
      <Td dataLabel="Users" visibility={LOW_PRIORITY_COLUMN}>
        {cluster.grantCount}
      </Td>
      <Td dataLabel="Last test">
        <LastTestCell lastTest={cluster.lastTest} credentialName={cluster.lastTestCredentialName} />
      </Td>
      <Td isActionCell>
        <ActionsColumn items={items} />
        {dialog}
      </Td>
    </Tr>
  );
}
