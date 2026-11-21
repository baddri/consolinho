import { Flex, FlexItem, Truncate } from '@patternfly/react-core';
import { Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { Credential } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterStatusLabel } from '../clusters/ClusterStatusLabel';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { CredentialExpiryLabel } from './CredentialExpiryLabel';
import { LastTestLabel } from './LastTestLabel';
import { ServiceAccountCell } from './ServiceAccountCell';

/** Number of columns of the fleet credentials table. */
export const FLEET_CREDENTIAL_COLUMN_COUNT = 7;

/** Responsive columns by index (Fingerprint, Grants), for the loading skeleton. */
export const FLEET_CREDENTIAL_COLUMN_VISIBILITY = { 3: LOW_PRIORITY_COLUMN, 5: LOW_PRIORITY_COLUMN } as const;

/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/** Path of the cluster's Credentials tab, where the per-credential actions live. */
const credentialsTabPath = (cluster: string) => `${clusterDetailPath(cluster)}/credentials`;

/**
 * One row of the fleet credentials list (CRED-7): the cluster on one line (environment label, name linking to its
 * Credentials tab, "Disabled" when the cluster is disabled), then the same identity, fingerprint, expiry, grant and
 * last-test cells as the cluster's own tab (Fingerprint and Grants share the header's `LOW_PRIORITY_COLUMN`).
 * Read-only: rotate/delete stay on the cluster tab.
 */
export function FleetCredentialRow({ credential }: { credential: Credential }) {
  return (
    <Tr>
      <Td dataLabel="Cluster" modifier="nowrap">
        <Flex
          spaceItems={{ default: 'spaceItemsSm' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'nowrap' }}
        >
          <FlexItem>
            <EnvironmentLabel environment={credential.clusterEnvironment} isCompact />
          </FlexItem>
          <FlexItem>
            <Link to={credentialsTabPath(credential.clusterName)}>{credential.clusterName}</Link>
          </FlexItem>
          {!credential.clusterIsEnabled && (
            <FlexItem>
              <ClusterStatusLabel isEnabled={false} />
            </FlexItem>
          )}
        </Flex>
      </Td>
      <Td dataLabel="Name">
        {credential.name}
        {credential.description !== null && (
          <div className={SUBTLE}>
            <Truncate content={credential.description} />
          </div>
        )}
      </Td>
      <Td dataLabel="Service account" modifier="nowrap">
        <ServiceAccountCell {...credential} />
      </Td>
      <Td dataLabel="Fingerprint" visibility={LOW_PRIORITY_COLUMN} className="pf-v6-u-font-family-monospace">
        {credential.fingerprint}
      </Td>
      <Td dataLabel="Expiry" modifier="nowrap">
        <CredentialExpiryLabel expiryStatus={credential.expiryStatus} expiresAt={credential.expiresAt} />
      </Td>
      <Td dataLabel="Grants" visibility={LOW_PRIORITY_COLUMN}>
        {credential.grantCount}
      </Td>
      <Td dataLabel="Last test">
        <LastTestLabel lastTest={credential.lastTest} />
      </Td>
    </Tr>
  );
}
