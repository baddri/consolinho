import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import type { Credential } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';
import { AdminResourceName } from '../AdminResourceLink';
import { CredentialDescription } from './CredentialDescription';
import { CredentialExpiryLabel } from './CredentialExpiryLabel';
import type { CredentialCluster } from './CredentialModalFrame';
import { formatInspectNamespaces } from './credentialText';
import { LastTestLabel } from './LastTestLabel';
import { ServiceAccountCell } from './ServiceAccountCell';
import { useCredentialActions } from './useCredentialActions';

/** Number of columns of the credentials table, including the trailing actions column. */
export const CREDENTIAL_COLUMN_COUNT = 8;

/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/**
 * One row of a cluster's credentials table (CRED-3/4): kind badge + name with its description (two lines at most) and,
 * when saved, the namespaces its tests inspect (NST-6; omitted when empty — credentials have no details page),
 * ServiceAccount identity, fingerprint, expiry, grant count, last test and last rotation, then the Rotate / Delete
 * kebab whose dialog renders in the row (a portalled modal) with the row's current representation.
 */
export function CredentialRow({ cluster, credential }: { cluster: CredentialCluster; credential: Credential }) {
  const { items, dialog } = useCredentialActions(cluster, credential);
  return (
    <Tr>
      <Td dataLabel="Name">
        <AdminResourceName kind="Credential">
          <span className="pf-v6-u-text-nowrap">{credential.name}</span>
        </AdminResourceName>
        {credential.description !== null && <CredentialDescription description={credential.description} />}
        {credential.inspectNamespaces.length > 0 && (
          // Same two-line clamp + full-text title as the description: a long list must not grow the row.
          <CredentialDescription
            description={`Inspect namespaces: ${formatInspectNamespaces(credential.inspectNamespaces)}`}
          />
        )}
      </Td>
      <Td dataLabel="Service account" modifier="nowrap">
        <ServiceAccountCell {...credential} />
      </Td>
      <Td dataLabel="Fingerprint" className="pf-v6-u-font-family-monospace">
        {credential.fingerprint}
      </Td>
      <Td dataLabel="Expiry" modifier="nowrap">
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
