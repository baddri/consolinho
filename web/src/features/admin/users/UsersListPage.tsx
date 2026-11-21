import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState } from 'react';
import type { UserListItem } from '@/shared/api';
import {
  FilterToolbar,
  LOW_PRIORITY_COLUMN,
  SingleSelectFilter,
  TableEmptyRow,
  TableNoMatchRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type SortValue,
} from '@/shared/table';
import { ActionButton, ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { useUsers } from './api';
import { CreateUserModal } from './CreateUserModal';
import {
  matchesUserFilters,
  READ_ONLY_OPTIONS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  USER_FILTERS,
} from './userFilters';
import { USER_COLUMN_COUNT, USER_COLUMN_VISIBILITY, UserRow } from './UserRow';
import { PRODUCT_NAME } from '@/shared/branding';

type SortColumn = 'username' | 'lastLogin';

const SORT_ACCESSORS: Record<SortColumn, (user: UserListItem) => SortValue> = {
  username: (user) => user.username,
  // ISO timestamps compare correctly as numbers; never-logged-in users are null and therefore always last.
  lastLogin: (user) => (user.lastLoginAt === null ? null : Date.parse(user.lastLoginAt)),
};

const NO_USERS: UserListItem[] = [];

/**
 * `/admin/users` — every FleetConsole user with role, status, read-only flag, grant count, last login and groups
 * (USR-1). Filters live in the URL (`?q=&role=&status=&readOnly=`) so filtered views are linkable; sorting is by
 * username (default) or last login, client-side. Read-only admins see the same page (ADM-2).
 *
 * The heading's "Add user" opens `CreateUserModal`; each row's kebab offers `useUserActions` (USR-2..6). For
 * read-only admins both stay visible but aria-disabled with the reason. Groups and Last login hide below `2xl` so the
 * compact table fits 1280 (`UX.md` §5). Lazy-loaded by `routes.tsx`.
 */
export function UsersListPage() {
  const { data, error, isPending, refetch } = useUsers();
  const { readOnlyReason } = useAdminAccess();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const { values, setText, toggle, setSingle, clear, clearAll } = useUrlFilters(USER_FILTERS);

  const users = data ?? NO_USERS;
  const visible = useMemo(() => users.filter((user) => matchesUserFilters(user, values)), [users, values]);
  const { sorted, sortProps } = useClientSort(visible, SORT_ACCESSORS, { by: 'username', direction: 'asc' });

  return (
    <>
      <PageHeading
        title="Users"
        subtitle={`Everyone who has logged in to ${PRODUCT_NAME} or was added by an administrator.`}
        actions={
          <ActionButton disabledReason={readOnlyReason} onClick={() => setCreateOpen(true)}>
            Add user
          </ActionButton>
        }
      />
      <PageBody>
        {error && <ErrorState error={error} title="Could not load users" onRetry={() => void refetch()} />}
        <FilterToolbar
          ariaLabel="Users toolbar"
          search={{
            value: values.q ?? '',
            onChange: (value) => setText('q', value),
            placeholder: 'Filter by username, name or group',
            ariaLabel: 'Search users',
          }}
          filters={[
            {
              key: 'role',
              label: 'Role',
              options: ROLE_OPTIONS,
              selected: values.role,
              onToggle: (value) => toggle('role', value),
              onClear: () => clear('role'),
            },
            {
              key: 'status',
              label: 'Status',
              options: STATUS_OPTIONS,
              selected: values.status,
              onToggle: (value) => toggle('status', value),
              onClear: () => clear('status'),
            },
          ]}
          filterItems={
            <SingleSelectFilter
              categoryName="Read only"
              options={READ_ONLY_OPTIONS}
              value={values.readOnly}
              onChange={(value) => setSingle('readOnly', value)}
            />
          }
          onClearAll={clearAll}
        />
        <CreateUserModal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} />
        <Table aria-label="Users" variant="compact">
          <Thead>
            <Tr>
              <Th modifier="nowrap" sort={sortProps('username', 0)}>
                Username
              </Th>
              <Th modifier="nowrap">Display name</Th>
              <Th modifier="nowrap">Role</Th>
              <Th modifier="nowrap">Status</Th>
              <Th modifier="nowrap">Read only</Th>
              <Th modifier="nowrap">Cluster grants</Th>
              <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN} sort={sortProps('lastLogin', 6)}>
                Last login
              </Th>
              <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN}>
                Groups
              </Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {isPending && <TableSkeletonRows columns={USER_COLUMN_COUNT} columnVisibility={USER_COLUMN_VISIBILITY} />}
            {data?.length === 0 && <TableEmptyRow colSpan={USER_COLUMN_COUNT} title="No users found" />}
            {users.length > 0 && sorted.length === 0 && (
              <TableNoMatchRow colSpan={USER_COLUMN_COUNT} onClearAll={clearAll} />
            )}
            {sorted.map((user) => (
              <UserRow key={user.username} user={user} />
            ))}
          </Tbody>
        </Table>
      </PageBody>
    </>
  );
}
