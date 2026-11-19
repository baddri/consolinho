import { Button, Content, PageSection, Title } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo } from 'react';
import type { UserListItem } from '@/shared/api';
import {
  FilterToolbar,
  TableEmptyRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type SortValue,
} from '@/shared/table';
import { ErrorState } from '@/shared/ui';
import { useUsers } from './api';
import { ReadOnlyFilter } from './ReadOnlyFilter';
import { matchesUserFilters, ROLE_OPTIONS, STATUS_OPTIONS, USER_FILTERS } from './userFilters';
import { USER_COLUMN_COUNT, UserRow } from './UserRow';

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
 * T-0031 adds the toolbar's "Add user" action and the row kebab. Lazy-loaded by `routes.tsx`.
 */
export function UsersListPage() {
  const { data, error, isPending, refetch } = useUsers();
  const { values, setText, toggle, setSingle, clear, clearAll } = useUrlFilters(USER_FILTERS);

  const users = data ?? NO_USERS;
  const visible = useMemo(() => users.filter((user) => matchesUserFilters(user, values)), [users, values]);
  const { sorted, sortProps } = useClientSort(visible, SORT_ACCESSORS, { by: 'username', direction: 'asc' });

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Users</Title>
        <Content component="p">
          Everyone who has logged in to FleetConsole or was added by an administrator.
        </Content>
      </PageSection>
      <PageSection>
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
            <ReadOnlyFilter value={values.readOnly} onChange={(value) => setSingle('readOnly', value)} />
          }
          onClearAll={clearAll}
          // T-0031: `actions` gets the "Add user" button.
        />
        <Table aria-label="Users" variant="compact">
          <Thead>
            <Tr>
              <Th sort={sortProps('username', 0)}>Username</Th>
              <Th>Display name</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Read only</Th>
              <Th>Clusters</Th>
              <Th sort={sortProps('lastLogin', 6)}>Last login</Th>
              <Th>Groups</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {isPending && <TableSkeletonRows columns={USER_COLUMN_COUNT} />}
            {data?.length === 0 && <TableEmptyRow colSpan={USER_COLUMN_COUNT} title="No users yet" />}
            {users.length > 0 && sorted.length === 0 && (
              <TableEmptyRow
                colSpan={USER_COLUMN_COUNT}
                title="No users match"
                body="No users match the current filters."
                icon={SearchIcon}
                actions={
                  <Button variant="link" onClick={clearAll}>
                    Clear filters
                  </Button>
                }
              />
            )}
            {sorted.map((user) => (
              <UserRow key={user.username} user={user} />
            ))}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
}
