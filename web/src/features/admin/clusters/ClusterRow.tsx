import { Flex, FlexItem, Truncate } from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { ClusterListItem } from '@/shared/api';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import { clusterDetailPath } from './clusterTarget';
import { LastTestCell } from './LastTestCell';
import { TlsModeLabel } from './TlsModeLabel';
import { useClusterActions } from './useClusterActions';
import { WorstExpiryIcon } from './WorstExpiryIcon';

/** Number of columns of the clusters table, including the trailing actions column. */
export const CLUSTER_COLUMN_COUNT = 9;

/** PatternFly utility class for secondary text (display names, disabled rows). */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/**
 * One row of the clusters list (CLU-7). Disabled clusters render in subtle text next to their "Disabled" label. The
 * trailing kebab offers `useClusterActions` (Edit, Enable/Disable, Delete); their dialog renders in the row (it is a
 * portalled modal) and confirms with the row's `version`.
 */
export function ClusterRow({ cluster }: { cluster: ClusterListItem }) {
  const { items, dialog } = useClusterActions(cluster);
  return (
    <Tr className={cluster.isEnabled ? undefined : SUBTLE}>
      <Td dataLabel="Name">
        <Link to={clusterDetailPath(cluster.name)}>{cluster.name}</Link>
        {cluster.displayName !== cluster.name && <div className={SUBTLE}>{cluster.displayName}</div>}
      </Td>
      <Td dataLabel="Environment">
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </Td>
      <Td dataLabel="API URL">
        <Truncate content={cluster.apiUrl} position="middle" />
      </Td>
      <Td dataLabel="Status">
        <ClusterStatusLabel isEnabled={cluster.isEnabled} />
      </Td>
      <Td dataLabel="TLS">
        <TlsModeLabel tlsMode={cluster.tlsMode} />
      </Td>
      <Td dataLabel="Credentials">
        <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
          <FlexItem>{cluster.credentialCount}</FlexItem>
          <FlexItem>
            <WorstExpiryIcon status={cluster.worstCredentialExpiryStatus} />
          </FlexItem>
        </Flex>
      </Td>
      <Td dataLabel="Users">{cluster.grantCount}</Td>
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
