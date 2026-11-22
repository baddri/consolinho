import { Flex, FlexItem } from '@patternfly/react-core';
import { ActionsColumn, Td, Tr, type IAction } from '@patternfly/react-table';
import type { Grant } from '@/shared/api';
import { disabledActionProps, EnvironmentLabel, RelativeTime } from '@/shared/ui';
import { AdminResourceLink, AdminResourceName } from '../AdminResourceLink';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { CredentialExpiryLabel } from '../credentials/CredentialExpiryLabel';
import { LastTestLabel } from '../credentials/LastTestLabel';
import { userDetailPath } from '../users/userColumns';
import { UserStatusLabel } from '../users/UserStatusLabel';
import { AccessModeLabel } from './AccessModeLabel';
import { GrantStateLabels } from './GrantStateLabels';

/** Which side of a grant a table lists: a user's clusters, or a cluster's users. */
export type GrantPerspective = 'user' | 'cluster';

/** Number of columns of the grants table, including the trailing actions column. */
export const GRANT_COLUMN_COUNT = 5;

/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/** Props for {@link GrantRow}. */
export interface GrantRowProps {
  grant: Grant;
  perspective: GrantPerspective;
  onChange: (grant: Grant) => void;
  onRevoke: (grant: Grant) => void;
  /** Disables Change and Revoke with this tooltip (ADM-2). */
  readOnlyReason?: string;
}

/** First cell of the user perspective: cluster link, display name and environment. */
function ClusterCell({ grant }: { grant: Grant }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <AdminResourceLink kind="Cluster" name={grant.clusterName} to={clusterDetailPath(grant.clusterName)} />
        {grant.clusterDisplayName !== grant.clusterName && (
          <div className={SUBTLE}>{grant.clusterDisplayName}</div>
        )}
      </FlexItem>
      <FlexItem>
        <EnvironmentLabel environment={grant.clusterEnvironment} isCompact />
      </FlexItem>
    </Flex>
  );
}

/** First cell of the cluster perspective: user link, display name and (non-deactivated) status. */
function UserCell({ grant }: { grant: Grant }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <AdminResourceLink kind="User" name={grant.username} to={userDetailPath(grant.username)} />
        {grant.userDisplayName !== null && <div className={SUBTLE}>{grant.userDisplayName}</div>}
      </FlexItem>
      {/* "User deactivated" is a GRANT-5 state label; showing the status label too would say it twice. */}
      {grant.userStatus !== 'deactivated' && (
        <FlexItem>
          <UserStatusLabel status={grant.userStatus} />
        </FlexItem>
      )}
    </Flex>
  );
}

/**
 * One grant (USR-7 / CLU-8): the other side of the grant (cluster or user), GRANT-5 state labels, access mode,
 * credential with expiry and last test, who granted it when, and the Change / Revoke kebab.
 */
export function GrantRow({ grant, perspective, onChange, onRevoke, readOnlyReason }: GrantRowProps) {
  const disabled = disabledActionProps(readOnlyReason);
  const items: IAction[] = [
    { title: 'Change', onClick: () => !readOnlyReason && onChange(grant), ...disabled },
    { title: 'Revoke', isDanger: true, onClick: () => !readOnlyReason && onRevoke(grant), ...disabled },
  ];
  return (
    <Tr>
      <Td dataLabel={perspective === 'user' ? 'Cluster' : 'User'}>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
          <FlexItem>{perspective === 'user' ? <ClusterCell grant={grant} /> : <UserCell grant={grant} />}</FlexItem>
          <FlexItem>
            <GrantStateLabels {...grant} />
          </FlexItem>
        </Flex>
      </Td>
      <Td dataLabel="Access mode">
        <AccessModeLabel accessMode={grant.accessMode} environment={grant.clusterEnvironment} />
      </Td>
      <Td dataLabel="Credential">
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
          <FlexItem>
            <AdminResourceName kind="Credential">{grant.credentialName}</AdminResourceName>
          </FlexItem>
          <FlexItem>
            <CredentialExpiryLabel expiryStatus={grant.credentialExpiryStatus} expiresAt={grant.credentialExpiresAt} />
          </FlexItem>
          <FlexItem>
            <LastTestLabel lastTest={grant.credentialLastTest} />
          </FlexItem>
        </Flex>
      </Td>
      <Td dataLabel="Granted">
        <RelativeTime value={grant.grantedAt} />
        <span className={SUBTLE}> by {grant.grantedBy}</span>
      </Td>
      <Td isActionCell>
        <ActionsColumn items={items} />
      </Td>
    </Tr>
  );
}
