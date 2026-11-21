import { Label } from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { UserListItem } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { LabelList, RelativeTime } from '@/shared/ui';
import { UserRoleLabels } from './UserRoleLabels';
import { UserStatusLabel } from './UserStatusLabel';
import { useUserActions } from './useUserActions';

/** Number of columns of the users table, including the trailing actions column. */
export const USER_COLUMN_COUNT = 9;

/** Responsive columns by index (Last login, Groups), for the loading skeleton. */
export const USER_COLUMN_VISIBILITY = { 6: LOW_PRIORITY_COLUMN, 7: LOW_PRIORITY_COLUMN } as const;

/** Path of a user's detail page; usernames may contain characters that need encoding (`:`, `@`, …). */
export const userDetailPath = (username: string) => `/admin/users/${encodeURIComponent(username)}`;

/** Placeholder for missing values, as elsewhere in the console. */
const EMPTY = '—';

/**
 * One row of the users list (USR-1); Last login and Groups share the header's `LOW_PRIORITY_COLUMN`. `dataLabel`s
 * repeat the column names for PatternFly's stacked mobile layout.
 * The trailing kebab (`ActionsColumn`) offers the user's actions from `useUserActions`; their dialog renders in the
 * row (it is a portalled modal) and confirms with the row's `version`.
 */
export function UserRow({ user }: { user: UserListItem }) {
  const { items, dialog } = useUserActions(user);
  return (
    <Tr>
      <Td dataLabel="Username">
        <Link to={userDetailPath(user.username)}>{user.username}</Link>
      </Td>
      <Td dataLabel="Display name">{user.displayName ?? EMPTY}</Td>
      <Td dataLabel="Role">
        <UserRoleLabels {...user} />
      </Td>
      <Td dataLabel="Status">
        <UserStatusLabel status={user.status} />
      </Td>
      <Td dataLabel="Read only">
        {user.isReadOnly ? (
          <Label isCompact color="orange">
            Read only
          </Label>
        ) : (
          EMPTY
        )}
      </Td>
      <Td dataLabel="Cluster grants">{user.grantCount}</Td>
      <Td dataLabel="Last login" visibility={LOW_PRIORITY_COLUMN} modifier="nowrap">
        <RelativeTime value={user.lastLoginAt} emptyText="Never" />
      </Td>
      <Td dataLabel="Groups" visibility={LOW_PRIORITY_COLUMN}>
        {user.groups.length > 0 ? (
          <LabelList labels={user.groups} max={3} aria-label={`Groups of ${user.username}`} />
        ) : (
          EMPTY
        )}
      </Td>
      <Td isActionCell>
        <ActionsColumn items={items} />
        {dialog}
      </Td>
    </Tr>
  );
}
