import { Flex, FlexItem } from '@patternfly/react-core';
import { Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { Credential } from '@/shared/api';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterStatusLabel } from '../clusters/ClusterStatusLabel';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { CredentialExpiryLabel } from './CredentialExpiryLabel';
import { LastTestLabel } from './LastTestLabel';
import { ServiceAccountCell } from './ServiceAccountCell';

/** Number of columns of the fleet credentials table. */
export const FLEET_CREDENTIAL_COLUMN_COUNT = 7;

/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/** Path of the cluster's Credentials tab, where the per-credential actions live. */
const credentialsTabPath = (cluster: string) => `${clusterDetailPath(cluster)}/credentials`;

/**
 * One row of the fleet credentials list (CRED-7): the cluster (environment label, name linking to its Credentials
 * tab, "Disabled" label when the cluster is disabled), then the same identity, fingerprint, expiry, grant and
 * last-test cells as the cluster's own tab. Read-only: rotate/delete stay on the cluster tab.
 */
export function FleetCredentialRow({ credential }: { credential: Credential }) {
  return (
    <Tr>
      <Td dataLabel="Cluster">
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
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
        {credential.description !== null && <div className={SUBTLE}>{credential.description}</div>}
      </Td>
      <Td dataLabel="Service account">
        <ServiceAccountCell {...credential} />
      </Td>
      <Td dataLabel="Fingerprint" className="pf-v6-u-font-family-monospace">
        {credential.fingerprint}
      </Td>
      <Td dataLabel="Expiry">
        <CredentialExpiryLabel expiryStatus={credential.expiryStatus} expiresAt={credential.expiresAt} />
      </Td>
      <Td dataLabel="Grants">{credential.grantCount}</Td>
      <Td dataLabel="Last test">
        <LastTestLabel lastTest={credential.lastTest} />
      </Td>
    </Tr>
  );
}
