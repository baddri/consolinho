import { Button } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { Grant } from '@/shared/api';
import {
  FilterToolbar,
  matchesText,
  TableEmptyRow,
  TableSkeletonRows,
  useUrlFilters,
  type FilterDefs,
} from '@/shared/table';
import { GRANT_COLUMN_COUNT, GrantRow, type GrantPerspective } from './GrantRow';

/** URL filter of the grants tabs: `?q=` searches cluster / user, display names and credential name. */
const GRANT_FILTERS = { q: { kind: 'text' } } as const satisfies FilterDefs;

/** Empty state of a grants table without any grant (QG-3). */
export interface GrantsEmptyState {
  title: string;
  body: string;
  /** The primary action, e.g. "Add access". */
  action: ReactNode;
}

/** Props for {@link GrantsTable}. */
export interface GrantsTableProps {
  /** The grants to list; `undefined` while loading (skeleton rows). */
  grants: Grant[] | undefined;
  perspective: GrantPerspective;
  /** Accessible name of the table, e.g. "Cluster access of alice". */
  ariaLabel: string;
  onChange: (grant: Grant) => void;
  onRevoke: (grant: Grant) => void;
  /** Disables the row actions with this reason (ADM-2). */
  readOnlyReason?: string;
  emptyState: GrantsEmptyState;
  /** Right-aligned toolbar actions (the create button). */
  toolbarActions?: ReactNode;
}

/**
 * Grants of one user or one cluster (USR-7, CLU-8): a URL-backed text filter (`q`) and a table whose first column is
 * the cluster (user perspective) or the user (cluster perspective), then access mode, credential and granted.
 * Loading shows skeleton rows, no grants the given empty state, a filter without matches "No grants match" with
 * "Clear filters". Row actions are reported to the caller, which owns the dialogs.
 */
export function GrantsTable({
  grants,
  perspective,
  ariaLabel,
  onChange,
  onRevoke,
  readOnlyReason,
  emptyState,
  toolbarActions,
}: GrantsTableProps) {
  const { values, setText, clearAll } = useUrlFilters(GRANT_FILTERS);
  const query = values.q ?? '';
  const visible = grants?.filter((grant) =>
    perspective === 'user'
      ? matchesText(query, grant.clusterName, grant.clusterDisplayName, grant.credentialName)
      : matchesText(query, grant.username, grant.userDisplayName, grant.credentialName),
  );

  return (
    <>
      <FilterToolbar
        ariaLabel="Grants toolbar"
        search={{
          value: query,
          onChange: (value) => setText('q', value),
          placeholder: perspective === 'user' ? 'Filter by cluster or credential' : 'Filter by user or credential',
          ariaLabel: 'Search grants',
        }}
        onClearAll={clearAll}
        actions={toolbarActions}
      />
      <Table aria-label={ariaLabel} variant="compact">
        <Thead>
          <Tr>
            <Th>{perspective === 'user' ? 'Cluster' : 'User'}</Th>
            <Th>Access mode</Th>
            <Th>Credential</Th>
            <Th>Granted</Th>
            <Th screenReaderText="Actions" />
          </Tr>
        </Thead>
        <Tbody>
          {grants === undefined && <TableSkeletonRows columns={GRANT_COLUMN_COUNT} rows={3} />}
          {grants?.length === 0 && (
            <TableEmptyRow
              colSpan={GRANT_COLUMN_COUNT}
              title={emptyState.title}
              body={emptyState.body}
              actions={emptyState.action}
            />
          )}
          {grants !== undefined && grants.length > 0 && visible?.length === 0 && (
            <TableEmptyRow
              colSpan={GRANT_COLUMN_COUNT}
              title="No grants match"
              body="No grants match the current filter."
              icon={SearchIcon}
              actions={
                <Button variant="link" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          )}
          {visible?.map((grant) => (
            <GrantRow
              key={grant.id}
              grant={grant}
              perspective={perspective}
              onChange={onChange}
              onRevoke={onRevoke}
              readOnlyReason={readOnlyReason}
            />
          ))}
        </Tbody>
      </Table>
    </>
  );
}
