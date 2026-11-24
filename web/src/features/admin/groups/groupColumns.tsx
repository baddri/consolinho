import { Flex } from '@patternfly/react-core';
import type { GroupRow } from '@/shared/api';
import type { DataViewColumn } from '@/shared/ui';
import { AdminResourceLink } from '../AdminResourceLink';
import { GroupMemberCount, GroupNotOnHostLabel } from './GroupHostLabels';
import { groupDetailPath } from './groupPaths';

/**
 * Columns of the groups list (GPG-1) for `ConsoleDataView`, after OCP's `useGroupColumns` (Name, Users) with the
 * fleet's Clusters count (number of group grants) in place of Created.
 */
export const GROUP_COLUMNS: DataViewColumn<GroupRow>[] = [
  {
    id: 'name',
    title: 'Name',
    type: 'name',
    // Names don't wrap (sticky Name column): room for badge, a typical group name and the "not found" label.
    width: 200,
    cell: (group) => (
      <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsCenter' }}>
        <AdminResourceLink kind="Group" name={group.name} to={groupDetailPath(group.name)} />
        <GroupNotOnHostLabel foundOnHost={group.foundOnHost} />
      </Flex>
    ),
    sortValue: (group) => group.name,
  },
  {
    id: 'users',
    title: 'Users',
    cell: (group) => <GroupMemberCount count={group.memberCount} foundOnHost={group.foundOnHost} />,
    sortValue: (group) => group.memberCount,
  },
  {
    id: 'clusters',
    title: 'Clusters',
    cell: (group) => group.clusterCount,
    sortValue: (group) => group.clusterCount,
  },
];
