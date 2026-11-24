import { Alert, EmptyState, EmptyStateBody, Stack, StackItem } from '@patternfly/react-core';
import { useMemo } from 'react';
import type { GroupList, GroupRow } from '@/shared/api';
import { matchesText, type FilterDefs } from '@/shared/table';
import { ConsoleDataView, DataViewTextFilter, ErrorState, PageBody, PageHeading, RelativeTime } from '@/shared/ui';
import { useAdminListFilters } from '../useAdminListFilters';
import { useGroups } from './api';
import { GROUP_COLUMNS } from './groupColumns';
import { HOST_GROUPS_HINT } from './GroupHostLabels';

/** URL filters of `/fleet/admin/groups`: `?q=` searches the group name. */
const GROUP_FILTERS = { q: { kind: 'text' } } as const satisfies FilterDefs;

/** Filter elements: Name only (OCP's Groups list has no attribute filters). Module-level, so never recreated. */
const FILTER_NODES = [<DataViewTextFilter key="q" filterId="q" title="Name" placeholder="Filter by name" />];

const nameOf = (group: GroupRow) => group.name;

/** Q7: the host group listing failed, so only groups named in grants are listed. */
function HostGroupsAlert({ list }: { list: GroupList }) {
  return (
    <Alert
      variant="warning"
      isInline
      title="Could not list groups on the host cluster. Only groups that have cluster access are shown."
    >
      {list.hostReadAt && (
        <>
          Last read <RelativeTime value={list.hostReadAt} />
        </>
      )}
    </Alert>
  );
}

/** GPG-4: no group at all (title as OCP `ConsoleDataView`'s "No <label> found"), with why groups appear and the host permission they need. */
function NoGroups() {
  return (
    <EmptyState variant="sm" titleText="No Groups found" headingLevel="h2">
      <EmptyStateBody>
        Groups appear here when they exist on the host cluster or have cluster access. {HOST_GROUPS_HINT}
      </EmptyStateBody>
    </EmptyState>
  );
}

/**
 * `/fleet/admin/groups` — host groups and groups that only exist in grants (`system:*` excluded server-side) with
 * member and cluster counts (GPG-1), as OCP's User Management › Groups list (`group.tsx:GroupPage`): `ConsoleDataView`
 * with a Name filter in the URL (`?q=`). No create action: groups are host objects. A failed host listing (Q7) shows
 * a warning above the list; a list without any group the GPG-4 empty state. Lazy-loaded by `routes.tsx`.
 */
export function GroupsListPage() {
  const { data, error, isPending, refetch } = useGroups();
  const { values, filterValues, onFilterChange, clearAll, isFiltered } = useAdminListFilters(GROUP_FILTERS);
  const items = data?.items;
  const filtered = useMemo(
    () => (items ?? []).filter((group) => matchesText(values.q ?? '', group.name)),
    [items, values],
  );

  return (
    <>
      <PageHeading title="Groups" />
      <PageBody>
        <Stack hasGutter>
          {data && data.hostStatus !== 'ok' && (
            <StackItem>
              <HostGroupsAlert list={data} />
            </StackItem>
          )}
          <StackItem>
            {items?.length === 0 ? (
              <NoGroups />
            ) : (
              <ConsoleDataView
                id="admin-groups"
                label="Groups"
                data={items}
                filteredData={filtered}
                loaded={!isPending}
                error={
                  error &&
                  !data && <ErrorState error={error} title="Could not load groups" onRetry={() => void refetch()} />
                }
                columns={GROUP_COLUMNS}
                getRowId={nameOf}
                filterNodes={FILTER_NODES}
                filterValues={filterValues}
                onFilterChange={onFilterChange}
                onClearAllFilters={clearAll}
                isFiltered={isFiltered}
              />
            )}
          </StackItem>
        </Stack>
      </PageBody>
    </>
  );
}
