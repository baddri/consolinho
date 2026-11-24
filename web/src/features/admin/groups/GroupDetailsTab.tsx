import { EmptyState, EmptyStateBody, Flex, Label } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { GroupDetail, GroupMember } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import { DASH, DetailsColumn, DetailsGrid, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { AdminResourceLink, AdminResourceName } from '../AdminResourceLink';
import { userDetailPath } from '../users/userColumns';
import { UserStatusLabel } from '../users/UserStatusLabel';
import { GroupMemberCount, HOST_GROUPS_HINT } from './GroupHostLabels';

/** Where the group is known from: the host cluster, or only the grants that name it. */
function sourceText(group: GroupDetail): string {
  return group.foundOnHost === false ? 'Grants only' : group.foundOnHost ? 'Host cluster' : DASH;
}

/** Name cell of a member: a user link when registered, else plain text with "No FleetConsole user". */
function MemberName({ member }: { member: GroupMember }) {
  if (member.isRegistered) {
    return <AdminResourceLink kind="User" name={member.username} to={userDetailPath(member.username)} />;
  }
  return (
    <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsCenter' }}>
      <AdminResourceName kind="User">{member.username}</AdminResourceName>
      <Label isCompact>No {PRODUCT_NAME} user</Label>
    </Flex>
  );
}

/**
 * The group's host members (OCP `group.tsx:UsersTable`, compact bordered table). No kebab: FleetConsole doesn't edit
 * host membership. `null` members (unknown) and `[]` get small empty states.
 */
function GroupMembers({ group }: { group: GroupDetail }) {
  if (group.members === null) {
    const hint = group.foundOnHost === false ? "The group doesn't exist on the host cluster." : HOST_GROUPS_HINT;
    return (
      <EmptyState variant="sm" titleText="Members unknown" headingLevel="h3">
        <EmptyStateBody>{hint}</EmptyStateBody>
      </EmptyState>
    );
  }
  if (group.members.length === 0) {
    return <EmptyState variant="sm" titleText="No users" headingLevel="h3" />;
  }
  return (
    <Table aria-label={`Users of ${group.name}`} variant="compact" borders>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Display name</Th>
          <Th>Status</Th>
        </Tr>
      </Thead>
      <Tbody>
        {group.members.map((member) => (
          <Tr key={member.username}>
            <Td dataLabel="Name">
              <MemberName member={member} />
            </Td>
            <Td dataLabel="Display name">{member.displayName ?? DASH}</Td>
            <Td dataLabel="Status">{member.status ? <UserStatusLabel status={member.status} /> : DASH}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Props for {@link GroupDetailsTab}. */
export interface GroupDetailsTabProps {
  group: GroupDetail;
}

/**
 * Details tab of the group detail page (GPG-2, OCP `group.tsx:GroupDetails`): "Group details" (name, user and cluster
 * counts, source) then a "Users" section with the host members, as sibling `DetailsSubsection`s (OCP's two `PaneBody`s).
 * Purely presentational; the page loads the group.
 */
export function GroupDetailsTab({ group }: GroupDetailsTabProps) {
  return (
    <>
      <DetailsSubsection title="Group details">
        <DetailsGrid>
          <DetailsColumn aria-label="Group details">
            <DetailsItem label="Name">{group.name}</DetailsItem>
            <DetailsItem label="Users">
              <GroupMemberCount count={group.members?.length ?? null} foundOnHost={group.foundOnHost} />
            </DetailsItem>
            <DetailsItem label="Clusters">{group.clusterCount}</DetailsItem>
            <DetailsItem label="Source">{sourceText(group)}</DetailsItem>
          </DetailsColumn>
        </DetailsGrid>
      </DetailsSubsection>
      <DetailsSubsection title="Users">
        <GroupMembers group={group} />
      </DetailsSubsection>
    </>
  );
}
