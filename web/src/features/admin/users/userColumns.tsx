import { Label } from '@patternfly/react-core';
import { ActionsColumn } from '@patternfly/react-table';
import type { UserListItem } from '@/shared/api';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { LabelList, RelativeTime, type DataViewColumn } from '@/shared/ui';
import { AdminResourceLink } from '../AdminResourceLink';
import { UserRoleLabels } from './UserRoleLabels';
import { USER_STATUS_TEXT, UserStatusLabel } from './UserStatusLabel';
import { useUserActions } from './useUserActions';

/** Path of a user's detail page; usernames may contain characters that need encoding (`:`, `@`, …). */
export const userDetailPath = (username: string) => `/admin/users/${encodeURIComponent(username)}`;

/** Placeholder for missing values, as elsewhere in the console. */
const EMPTY = '—';

/**
 * Columns of the users list (USR-1) for `ConsoleDataView`: Name (kind badge + link, sortable) first, Last login and
 * Groups hide below `2xl` so the compact table fits 1280 (`UX.md` §5).
 */
export const USER_COLUMNS: DataViewColumn<UserListItem>[] = [
  {
    id: 'name',
    title: 'Name',
    type: 'name',
    // Names don't wrap (sticky Name column): start wide enough for a badge + a typical username.
    width: 150,
    cell: (user) => <AdminResourceLink kind="User" name={user.username} to={userDetailPath(user.username)} />,
    sortValue: (user) => user.username,
  },
  {
    id: 'displayName',
    title: 'Display name',
    cell: (user) => user.displayName ?? EMPTY,
    sortValue: (user) => user.displayName,
  },
  { id: 'role', title: 'Role', cell: (user) => <UserRoleLabels {...user} />, sortValue: (user) => user.role },
  {
    id: 'status',
    title: 'Status',
    cell: (user) => <UserStatusLabel status={user.status} />,
    sortValue: (user) => USER_STATUS_TEXT[user.status],
  },
  {
    id: 'readOnly',
    title: 'Read only',
    cell: (user) =>
      user.isReadOnly ? (
        <Label isCompact color="orange">
          Read only
        </Label>
      ) : (
        EMPTY
      ),
  },
  { id: 'grants', title: 'Cluster grants', cell: (user) => user.grantCount, sortValue: (user) => user.grantCount },
  {
    id: 'lastLogin',
    title: 'Last login',
    visibility: LOW_PRIORITY_COLUMN,
    cell: (user) => <RelativeTime value={user.lastLoginAt} emptyText="Never" />,
    // ISO timestamps compare correctly as numbers; never-logged-in users are null and therefore always last.
    sortValue: (user) => (user.lastLoginAt === null ? null : Date.parse(user.lastLoginAt)),
  },
  {
    id: 'groups',
    title: 'Groups',
    visibility: LOW_PRIORITY_COLUMN,
    // A group label doesn't wrap: start wide enough for a name like `fleetconsole-admins`.
    width: 180,
    cell: (user) =>
      user.groups.length > 0 ? (
        <LabelList labels={user.groups} max={3} aria-label={`Groups of ${user.username}`} />
      ) : (
        EMPTY
      ),
  },
];

/**
 * The kebab of one users-list row: `useUserActions` items, with their dialog rendered next to it (a portalled
 * modal) so it confirms with the row's `version`.
 */
export function UserRowActions({ user }: { user: UserListItem }) {
  const { items, dialog } = useUserActions(user);
  return (
    <>
      <ActionsColumn items={items} />
      {dialog}
    </>
  );
}
