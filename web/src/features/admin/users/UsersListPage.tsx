import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useMemo, useState } from 'react';
import type { UserListItem } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import { ActionButton, ConsoleDataView, DataViewTextFilter, ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { useAdminAccess } from '../useAdminAccess';
import { useAdminListFilters } from '../useAdminListFilters';
import { useUsers } from './api';
import { CreateUserModal } from './CreateUserModal';
import { USER_COLUMNS, UserRowActions } from './userColumns';
import { matchesUserFilters, READ_ONLY_OPTIONS, ROLE_OPTIONS, STATUS_OPTIONS, USER_FILTERS } from './userFilters';

/** Filter elements (OCP `ConsoleDataView`): Name, then the attribute filters. Module-level, so never recreated. */
const FILTER_NODES = [
  <DataViewTextFilter key="q" filterId="q" title="Name" placeholder="Filter by name" />,
  <DataViewCheckboxFilter key="role" filterId="role" title="Role" placeholder="Filter by role" options={ROLE_OPTIONS} />,
  <DataViewCheckboxFilter
    key="status"
    filterId="status"
    title="Status"
    placeholder="Filter by status"
    options={STATUS_OPTIONS}
  />,
  <DataViewCheckboxFilter
    key="readOnly"
    filterId="readOnly"
    title="Read only"
    placeholder="Filter by read only"
    options={READ_ONLY_OPTIONS}
  />,
];

const usernameOf = (user: UserListItem) => user.username;

/**
 * `/fleet/admin/users` — every FleetConsole user with role, status, read-only flag, grant count, last login and groups
 * (USR-1), as an OCP list page (`UX.md` §5): `ConsoleDataView` with the category filter (Name searches username,
 * display name and groups; Role, Status, Read only), column management and pagination. Filters live in the URL
 * (`?q=&role=&status=&readOnly=`) so filtered views are linkable. Read-only admins see the same page (ADM-2).
 *
 * The heading's "Add user" opens `CreateUserModal`; each row's kebab offers `useUserActions` (USR-2..6). For
 * read-only admins both stay visible but aria-disabled with the reason. Lazy-loaded by `routes.tsx`.
 */
export function UsersListPage() {
  const { data, error, isPending, refetch } = useUsers();
  const { readOnlyReason } = useAdminAccess();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const { values, filterValues, onFilterChange, clearAll, isFiltered } = useAdminListFilters(USER_FILTERS);

  const filtered = useMemo(() => (data ?? []).filter((user) => matchesUserFilters(user, values)), [data, values]);
  const rowActions = useCallback((user: UserListItem) => <UserRowActions user={user} />, []);

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
        <ConsoleDataView
          id="admin-users"
          label="Users"
          data={data}
          filteredData={filtered}
          loaded={!isPending}
          error={error && !data && <ErrorState error={error} title="Could not load users" onRetry={() => void refetch()} />}
          columns={USER_COLUMNS}
          getRowId={usernameOf}
          filterNodes={FILTER_NODES}
          filterValues={filterValues}
          onFilterChange={onFilterChange}
          onClearAllFilters={clearAll}
          isFiltered={isFiltered}
          rowActions={rowActions}
        />
        <CreateUserModal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} />
      </PageBody>
    </>
  );
}
