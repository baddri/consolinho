import { Flex, FlexItem } from '@patternfly/react-core';
import type { Credential } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { EnvironmentLabel, type DataViewColumn } from '@/shared/ui';
import { AdminResourceLink, AdminResourceName } from '../AdminResourceLink';
import { ClusterStatusLabel } from '../clusters/ClusterStatusLabel';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { CredentialDescription } from './CredentialDescription';
import { CredentialExpiryLabel } from './CredentialExpiryLabel';
import { LastTestLabel } from './LastTestLabel';
import { ServiceAccountCell } from './ServiceAccountCell';

/** Path of the cluster's Credentials tab, where the per-credential actions live. */
const credentialsTabPath = (cluster: string) => `${clusterDetailPath(cluster)}/credentials`;

/**
 * Columns of the fleet credentials list (CRED-7) for `ConsoleDataView`. The cluster comes first (sticky name column,
 * linking to its Credentials tab, "Disabled" when the cluster is), then the credential with its description clamped
 * to two lines and the same identity, fingerprint, expiry, grant and last-test cells as the cluster's own tab.
 * Environment and Grants hide below `2xl` (`UX.md` §5), Fingerprint is an additional column. Read-only: rotate/delete
 * stay on the cluster tab.
 */
export const FLEET_CREDENTIAL_COLUMNS: DataViewColumn<Credential>[] = [
  {
    id: 'cluster',
    title: 'Cluster',
    type: 'name',
    cell: (credential) => (
      <Flex
        spaceItems={{ default: 'spaceItemsSm' }}
        alignItems={{ default: 'alignItemsBaseline' }}
        flexWrap={{ default: 'nowrap' }}
      >
        <FlexItem>
          <AdminResourceLink
            kind="Cluster"
            name={credential.clusterName}
            to={credentialsTabPath(credential.clusterName)}
          />
        </FlexItem>
        {!credential.clusterIsEnabled && (
          <FlexItem>
            <ClusterStatusLabel isEnabled={false} />
          </FlexItem>
        )}
      </Flex>
    ),
    sortValue: (credential) => credential.clusterName,
  },
  {
    id: 'environment',
    title: 'Environment',
    visibility: LOW_PRIORITY_COLUMN,
    cell: (credential) => <EnvironmentLabel environment={credential.clusterEnvironment} isCompact />,
    sortValue: (credential) => credential.clusterEnvironment,
  },
  {
    id: 'name',
    title: 'Name',
    cell: (credential) => (
      <>
        <AdminResourceName kind="Credential">{credential.name}</AdminResourceName>
        {credential.description !== null && <CredentialDescription description={credential.description} />}
      </>
    ),
    sortValue: (credential) => credential.name,
  },
  {
    id: 'serviceAccount',
    title: 'Service account',
    cell: (credential) => <ServiceAccountCell {...credential} />,
    sortValue: (credential) => credential.serviceAccount ?? credential.subject,
  },
  {
    id: 'fingerprint',
    title: 'Fingerprint',
    // An additional column ("Manage columns"): needed only to match a token, and the table fits without it.
    defaultVisible: false,
    cell: (credential) => <span className="pf-v6-u-font-family-monospace">{credential.fingerprint}</span>,
  },
  {
    id: 'expiry',
    title: 'Expiry',
    cell: (credential) => (
      <CredentialExpiryLabel expiryStatus={credential.expiryStatus} expiresAt={credential.expiresAt} />
    ),
    // Ascending with nulls last is the server's primary order (CRED-7); the sort is stable, so it keeps that order.
    sortValue: (credential) => (credential.expiresAt === null ? null : Date.parse(credential.expiresAt)),
  },
  {
    id: 'grants',
    title: 'Grants',
    visibility: LOW_PRIORITY_COLUMN,
    cell: (credential) => credential.grantCount,
    sortValue: (credential) => credential.grantCount,
  },
  {
    id: 'lastTest',
    title: 'Last test',
    // The status line ("Passed · Cluster-wide view") doesn't wrap: start wide enough for it.
    width: 230,
    cell: (credential) => <LastTestLabel lastTest={credential.lastTest} />,
  },
];
