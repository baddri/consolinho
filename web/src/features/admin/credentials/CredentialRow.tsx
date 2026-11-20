import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import type { Credential } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';
import { CredentialExpiryLabel } from './CredentialExpiryLabel';
import type { CredentialCluster } from './CredentialModalFrame';
import { LastTestLabel } from './LastTestLabel';
import { ServiceAccountCell } from './ServiceAccountCell';
import { useCredentialActions } from './useCredentialActions';

/** Number of columns of the credentials table, including the trailing actions column. */
export const CREDENTIAL_COLUMN_COUNT = 8;

/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/**
 * One row of a cluster's credentials table (CRED-3/4): name with description, ServiceAccount identity, fingerprint,
 * expiry, grant count, last test and last rotation, then the Rotate / Delete kebab whose dialog renders in the row
 * (a portalled modal) with the row's current representation.
 */
export function CredentialRow({ cluster, credential }: { cluster: CredentialCluster; credential: Credential }) {
  const { items, dialog } = useCredentialActions(cluster, credential);
  return (
    <Tr>
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
      <Td dataLabel="Rotated">
        {credential.rotatedAt === null ? (
          <span className={SUBTLE}>Never</span>
        ) : (
          <>
            <RelativeTime value={credential.rotatedAt} />
            {credential.rotatedBy !== null && <span className={SUBTLE}> by {credential.rotatedBy}</span>}
          </>
        )}
      </Td>
      <Td isActionCell>
        <ActionsColumn items={items} />
        {dialog}
      </Td>
    </Tr>
  );
}
