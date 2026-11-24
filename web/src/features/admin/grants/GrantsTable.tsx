import { Button } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { Grant, GrantSubjectKind } from '@/shared/api';
import {
  FilterToolbar,
  matchesText,
  TableEmptyRow,
  TableSkeletonRows,
  useUrlFilters,
  type FilterDefs,
} from '@/shared/table';
import {
  grantColumnCount,
  grantColumns,
  GrantRow,
  NOWRAP_GRANT_COLUMNS,
  type GrantPerspective,
} from './GrantRow';
import { SUBJECT_KIND_TEXT } from './grantText';

const SUBJECT_KINDS: readonly GrantSubjectKind[] = ['user', 'group'];

/**
 * URL filters of the grants tabs: `?q=` searches cluster or subject, display names and credential name; `?kind=`
 * (cluster perspective only) keeps user and/or group grants.
 */
const GRANT_FILTERS = {
  q: { kind: 'text' },
  kind: { kind: 'multi', values: SUBJECT_KINDS },
} as const satisfies FilterDefs;

/** Options of the "Subject kind" checkbox filter. */
const SUBJECT_KIND_OPTIONS = SUBJECT_KINDS.map((kind) => ({ value: kind, label: SUBJECT_KIND_TEXT[kind] }));

/** Search placeholder per perspective: the column(s) `q` searches first. */
const SEARCH_PLACEHOLDER: Readonly<Record<GrantPerspective, string>> = {
  user: 'Filter by cluster or credential',
  cluster: 'Filter by subject name or credential',
  group: 'Filter by cluster or credential',
};

/** Empty state of a grants table without any grant (QG-3). */
export interface GrantsEmptyState {
  title: string;
  body: string;
  /** The primary action, e.g. "Grant access". */
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
 * Grants of one user, cluster or group (USR-7, CLU-8, UIG-4): URL-backed filters and a table with the perspective's
 * columns (`grantColumns`). The cluster perspective lists user and group grants in API order, like OCP's
 * RoleBindings list (Subject kind, Subject name, …), and adds the "Subject kind" checkbox filter (`?kind=`).
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
  const { values, setText, toggle, clear, clearAll } = useUrlFilters(GRANT_FILTERS);
  const query = values.q ?? '';
  // The kind filter only exists on the cluster tab; a stray `?kind=` elsewhere is ignored.
  const kinds = perspective === 'cluster' ? values.kind : [];
  const columns = grantColumns(perspective);
  const columnCount = grantColumnCount(perspective);
  const visible = grants?.filter(
    (grant) =>
      (kinds.length === 0 || kinds.includes(grant.subjectKind)) &&
      (perspective === 'cluster'
        ? matchesText(query, grant.subjectName, grant.userDisplayName, grant.credentialName)
        : matchesText(query, grant.clusterName, grant.clusterDisplayName, grant.credentialName)),
  );

  return (
    <>
      <FilterToolbar
        ariaLabel="Grants toolbar"
        search={{
          value: query,
          onChange: (value) => setText('q', value),
          placeholder: SEARCH_PLACEHOLDER[perspective],
          ariaLabel: 'Search grants',
        }}
        filters={
          perspective === 'cluster'
            ? [
                {
                  key: 'kind',
                  label: 'Subject kind',
                  options: SUBJECT_KIND_OPTIONS,
                  selected: values.kind,
                  onToggle: (value) => toggle('kind', value),
                  onClear: () => clear('kind'),
                },
              ]
            : undefined
        }
        onClearAll={clearAll}
        actions={toolbarActions}
      />
      <Table aria-label={ariaLabel} variant="compact">
        <Thead>
          <Tr>
            {columns.map((column) => (
              <Th key={column} modifier={NOWRAP_GRANT_COLUMNS.has(column) ? 'nowrap' : undefined}>
                {column}
              </Th>
            ))}
            <Th screenReaderText="Actions" />
          </Tr>
        </Thead>
        <Tbody>
          {grants === undefined && <TableSkeletonRows columns={columnCount} rows={3} />}
          {grants?.length === 0 && (
            <TableEmptyRow
              colSpan={columnCount}
              title={emptyState.title}
              body={emptyState.body}
              actions={emptyState.action}
            />
          )}
          {grants !== undefined && grants.length > 0 && visible?.length === 0 && (
            <TableEmptyRow
              colSpan={columnCount}
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
