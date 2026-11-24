import { Flex, FlexItem } from '@patternfly/react-core';
import { ActionsColumn, Td, Tr, type IAction } from '@patternfly/react-table';
import type { Grant } from '@/shared/api';
import { DASH, disabledActionProps, EnvironmentLabel, RelativeTime } from '@/shared/ui';
import { AdminResourceLink, AdminResourceName } from '../AdminResourceLink';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { CredentialExpiryLabel } from '../credentials/CredentialExpiryLabel';
import { LastTestLabel } from '../credentials/LastTestLabel';
import { groupDetailPath } from '../groups/groupPaths';
import { userDetailPath } from '../users/userColumns';
import { UserStatusLabel } from '../users/UserStatusLabel';
import { AccessModeLabel } from './AccessModeLabel';
import { GrantStateLabels } from './GrantStateLabels';
import { SUBJECT_KIND_TEXT } from './grantText';

/**
 * Which side of a grant a table lists: a user's clusters (`user`), a cluster's users and groups (`cluster`), or a
 * group's clusters (`group`).
 */
export type GrantPerspective = 'user' | 'cluster' | 'group';

/** Data columns of a grants table (header text = `dataLabel`). */
export type GrantColumn =
  'Cluster' | 'Subject kind' | 'Subject name' | 'Access mode' | 'Priority' | 'Credential' | 'Granted';

/** Data columns per perspective; the cluster's follow OCP's RoleBinding list (`useRoleBindingsColumns`). */
const GRANT_COLUMNS: Readonly<Record<GrantPerspective, readonly GrantColumn[]>> = {
  user: ['Cluster', 'Access mode', 'Credential', 'Granted'],
  cluster: ['Subject kind', 'Subject name', 'Access mode', 'Priority', 'Credential', 'Granted'],
  group: ['Cluster', 'Access mode', 'Priority', 'Credential', 'Granted'],
};

/** The data columns of a grants table in `perspective`, in display order. */
export const grantColumns = (perspective: GrantPerspective): readonly GrantColumn[] =>
  GRANT_COLUMNS[perspective];

/** Number of columns of a grants table in `perspective`, including the trailing actions column. */
export const grantColumnCount = (perspective: GrantPerspective): number =>
  GRANT_COLUMNS[perspective].length + 1;

/**
 * Columns that keep their content on one line, so no header truncates at 1280 (OCP `useRoleBindingsColumns` sets
 * `nowrap` on every data column); Credential wraps and absorbs the width.
 */
export const NOWRAP_GRANT_COLUMNS: ReadonlySet<GrantColumn> = new Set([
  'Subject kind',
  'Subject name',
  'Access mode',
  'Priority',
]);


/** PatternFly utility class for secondary text. */
const SUBTLE = 'pf-v6-u-text-color-subtle';

/** Props for {@link GrantRow}. */
export interface GrantRowProps {
  grant: Grant;
  perspective: GrantPerspective;
  onChange: (grant: Grant) => void;
  onRevoke: (grant: Grant) => void;
  /** Disables Edit access and Revoke access with this tooltip (ADM-2, UIG-6). */
  readOnlyReason?: string;
}

/** First cell of the user perspective: cluster link, display name and environment. */
function ClusterCell({ grant }: { grant: Grant }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <AdminResourceLink
          kind="Cluster"
          name={grant.clusterName}
          to={clusterDetailPath(grant.clusterName)}
        />
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

/** Subject name of the cluster perspective: user link, display name and (non-deactivated) status, or group link. */
function SubjectCell({ grant }: { grant: Grant }) {
  if (grant.subjectKind === 'group') {
    return (
      <AdminResourceLink kind="Group" name={grant.subjectName} to={groupDetailPath(grant.subjectName)} />
    );
  }
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <AdminResourceLink kind="User" name={grant.subjectName} to={userDetailPath(grant.subjectName)} />
        {grant.userDisplayName !== null && <div className={SUBTLE}>{grant.userDisplayName}</div>}
      </FlexItem>
      {/* "User deactivated" is a GRANT-5 state label; showing the status label too would say it twice. */}
      {grant.userStatus !== null && grant.userStatus !== 'deactivated' && (
        <FlexItem>
          <UserStatusLabel status={grant.userStatus} />
        </FlexItem>
      )}
    </Flex>
  );
}

/** One cell of a grant row; `column` picks the content. */
function GrantCell({ grant, column }: { grant: Grant; column: GrantColumn }) {
  switch (column) {
    case 'Cluster':
    case 'Subject name':
      return (
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
          <FlexItem>
            {column === 'Cluster' ? <ClusterCell grant={grant} /> : <SubjectCell grant={grant} />}
          </FlexItem>
          <FlexItem>
            <GrantStateLabels {...grant} />
          </FlexItem>
        </Flex>
      );
    case 'Subject kind':
      // Plain text, as OCP's RoleBinding list (`cell: binding.subject.kind`); the badge sits on the name link.
      return SUBJECT_KIND_TEXT[grant.subjectKind];
    case 'Access mode':
      return <AccessModeLabel accessMode={grant.accessMode} environment={grant.clusterEnvironment} />;
    case 'Priority':
      return grant.priority ?? DASH;
    case 'Credential':
      return (
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
          <FlexItem>
            <AdminResourceName kind="Credential">{grant.credentialName}</AdminResourceName>
          </FlexItem>
          <FlexItem>
            <CredentialExpiryLabel
              expiryStatus={grant.credentialExpiryStatus}
              expiresAt={grant.credentialExpiresAt}
            />
          </FlexItem>
          <FlexItem>
            <LastTestLabel lastTest={grant.credentialLastTest} />
          </FlexItem>
        </Flex>
      );
    case 'Granted':
      return (
        <>
          <RelativeTime value={grant.grantedAt} />
          <span className={SUBTLE}> by {grant.grantedBy}</span>
        </>
      );
  }
}

/**
 * One grant (USR-7 / CLU-8 / UIG-4) with the columns of `perspective` ({@link grantColumns}): the other side of the
 * grant (cluster, or subject kind and name), GRANT-5 state labels, access mode, priority (group grants; `-` for
 * users), credential with expiry and last test, who granted it when, and the Edit access / Revoke access kebab.
 */
export function GrantRow({ grant, perspective, onChange, onRevoke, readOnlyReason }: GrantRowProps) {
  const disabled = disabledActionProps(readOnlyReason);
  const items: IAction[] = [
    { title: 'Edit access', onClick: () => !readOnlyReason && onChange(grant), ...disabled },
    {
      title: 'Revoke access',
      isDanger: true,
      onClick: () => !readOnlyReason && onRevoke(grant),
      ...disabled,
    },
  ];
  return (
    <Tr>
      {grantColumns(perspective).map((column) => (
        <Td
          key={column}
          dataLabel={column}
          modifier={NOWRAP_GRANT_COLUMNS.has(column) ? 'nowrap' : undefined}
        >
          <GrantCell grant={grant} column={column} />
        </Td>
      ))}
      <Td isActionCell>
        <ActionsColumn items={items} />
      </Td>
    </Tr>
  );
}
