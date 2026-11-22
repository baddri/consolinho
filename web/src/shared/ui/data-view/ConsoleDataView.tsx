import {
  Bullseye,
  Button,
  EmptyState,
  Pagination,
  PaginationVariant,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import {
  DataView,
  DataViewFilters,
  DataViewState,
  DataViewTable,
  DataViewToolbar,
  type DataViewTr,
} from '@patternfly/react-data-view';
import { RhUiColumnsIcon, RhUiFilterIcon, RhUiUndoIcon } from '@patternfly/react-icons';
import { Tbody, Td, Tr, type TdProps, type ThProps } from '@patternfly/react-table';
import { Fragment, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { TableSkeletonRows, useClientSort, type SortState, type SortValue } from '@/shared/table';
import styles from './ConsoleDataView.module.css';
import { ColumnManagementModal } from './ColumnManagementModal';
import { LabelSuggestionsContext } from './labelSuggestions';
import type { DataViewColumn } from './types';
import { useDataViewColumns } from './useDataViewColumns';

/** A header cell of `DataViewTable` (the package index exports the type under the component's name `DataViewTh`). */
type DataViewTh = ComponentProps<typeof DataViewTable>['columns'][number];

/** A filter's value: text filters hold a string, checkbox filters the selected values. */
export type DataViewFilterValue = string | string[] | undefined;

/** Props for {@link ConsoleDataView}. */
export interface ConsoleDataViewProps<T> {
  /** Stable list id (e.g. the kind's plural); keys the remembered columns and widths. */
  id: string;
  /** Plural shown in "No <label> found" and the table name ("Pods"). */
  label: string;
  /** Loaded objects before client-side filtering; decides the "nothing at all" state and label suggestions. */
  data: T[] | undefined;
  /** Objects passing the filters; this is what is sorted and paged. */
  filteredData: T[];
  loaded: boolean;
  /** Rendered instead of the data view (OCP `StatusBox`), e.g. an `ErrorState`. */
  error?: ReactNode;
  /** Every column, in order; `defaultVisible: false` ones only after "Manage columns". */
  columns: DataViewColumn<T>[];
  getRowId: (obj: T) => string;
  /** Initial sort; defaults to `name` ascending. */
  defaultSort?: SortState<string>;
  /**
   * Filter elements for `DataViewFilters` (`DataViewTextFilter`, `DataViewLabelFilter`, PF `DataViewCheckboxFilter`),
   * each with `filterId` and `title`. Memoise them: a change of their props resets the selected category.
   */
  filterNodes: ReactNode[];
  /** Current value per `filterId`. */
  filterValues: Readonly<Record<string, DataViewFilterValue>>;
  onFilterChange: (filterId: string, value: DataViewFilterValue) => void;
  onClearAllFilters: () => void;
  /** Whether any filter applies (server-side ones included). */
  isFiltered: boolean;
  /** Labels of an object, for the label filter's suggestions. */
  getLabels?: (obj: T) => Readonly<Record<string, string>> | undefined;
  /** Content of the trailing sticky kebab cell of a row; no actions column without it. */
  rowActions?: (obj: T) => ReactNode;
  /** The list has a Namespace column shown only in all-projects mode (column management says so). */
  hasNamespaceHint?: boolean;
}

const DEFAULT_PER_PAGE = 50;

/** OCP `useConsoleDataViewColumns` sticky props: Name sticky with a right border; kebab sticky with a left border. */
const STICKY = { isStickyColumn: true, stickyMinWidth: '0' } as const;
const NAME_PROPS = { ...STICKY, hasRightBorder: true } as const;
const ACTIONS_HEADER_PROPS = { ...STICKY, hasLeftBorder: true } as const;
const ACTIONS_CELL_PROPS = { ...STICKY, hasLeftBorder: true, isActionCell: true } as const;

/**
 * Props of a column's header (`th: true`) or cells (OCP `useConsoleDataViewColumns`): every header is `nowrap` so
 * headers never truncate (T-0095); Name is sticky with a right border and `nowrap` in its cells too, Namespace cells
 * don't wrap; other cells wrap normally (long messages).
 */
function columnProps<T>(column: DataViewColumn<T>, th: boolean): TdProps & ThProps {
  const nowrap = th || column.type !== undefined;
  return {
    visibility: column.visibility,
    ...(nowrap ? { modifier: 'nowrap' as const } : {}),
    ...(column.type === 'name' ? NAME_PROPS : {}),
  };
}

/** `useClientSort` accessors of the sortable columns; `null` for missing values (sorted last). */
function sortAccessors<T>(columns: DataViewColumn<T>[]): Record<string, (obj: T) => SortValue> {
  return Object.fromEntries(
    columns.flatMap((column) =>
      column.sortValue ? [[column.id, (obj: T) => column.sortValue?.(obj) ?? null] as const] : [],
    ),
  );
}

/** Labels of the listed objects as sorted `key=value` strings. */
function labelSuggestions<T>(
  data: T[] | undefined,
  getLabels: ConsoleDataViewProps<T>['getLabels'],
): string[] {
  if (!data || !getLabels) return [];
  const labels = new Set<string>();
  for (const obj of data) {
    for (const [key, value] of Object.entries(getLabels(obj) ?? {})) labels.add(`${key}=${value}`);
  }
  return [...labels].sort();
}

/** OCP `BodyEmpty`: one row with the centred "No <label> found". */
function BodyEmpty({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <Tbody>
      <Tr>
        <Td colSpan={colSpan}>
          <Bullseye>No {label} found</Bullseye>
        </Td>
      </Tr>
    </Tbody>
  );
}

/**
 * The generic list of the console, mirroring OCP `ConsoleDataView` (`UX.md` §5) on PF `@patternfly/react-data-view`:
 * a `DataViewToolbar` with the filters (category select hidden for a single filter, chips, "Clear filters"), plain
 * "Manage columns" and "Reset column widths" icon buttons and compact top pagination; a compact, resizable
 * `DataViewTable` with sortable `nowrap` headers, a sticky Name column and a sticky kebab column; compact bottom
 * pagination. Loading = 5 skeleton rows, filtered to nothing = a "No <label> found" row, no objects at all = an
 * empty state alone (OCP `EmptyBox`), `error` = the error alone (OCP `StatusBox`).
 *
 * Filtering is the caller's (values usually live in the URL); sorting, paging (50 per page), column choice and widths
 * are handled here, the latter two remembered per `id`.
 */
export function ConsoleDataView<T>({
  id,
  label,
  data,
  filteredData,
  loaded,
  error,
  columns,
  getRowId,
  defaultSort = { by: 'name', direction: 'asc' },
  filterNodes,
  filterValues,
  onFilterChange,
  onClearAllFilters,
  isFiltered,
  getLabels,
  rowActions,
  hasNamespaceHint = false,
}: ConsoleDataViewProps<T>) {
  const { shown, managed, setColumnChoice, widths, setWidth, resetWidths } = useDataViewColumns(id, columns);
  const [isManagingColumns, setManagingColumns] = useState(false);
  // PF data-view headers read their width once on mount: remount the table when widths are reset.
  const [tableGeneration, setTableGeneration] = useState(0);

  const accessors = useMemo(() => sortAccessors(columns), [columns]);
  const { sorted, sortProps } = useClientSort(filteredData, accessors, defaultSort);

  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  // Back to page 1 whenever the filters change.
  const filterKey = JSON.stringify(filterValues);
  const [paging, setPaging] = useState({ page: 1, filterKey });
  const lastPage = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(paging.filterKey === filterKey ? paging.page : 1, lastPage);
  const pageRows = useMemo(() => sorted.slice((page - 1) * perPage, page * perPage), [sorted, page, perPage]);

  const suggestions = useMemo(() => labelSuggestions(data, getLabels), [data, getLabels]);

  const headers = useMemo<DataViewTh[]>(
    () => [
      ...shown.map((column, index) => ({
        cell: column.title,
        props: {
          ...columnProps(column, true),
          sort: column.sortValue ? sortProps(column.id, index) : undefined,
        },
        resizableProps: {
          isResizable: true,
          width: widths[column.id],
          onResize: (_event: unknown, _id: unknown, width: number) => setWidth(column.id, width),
          resizeButtonAriaLabel: `Resize ${column.title} column`,
        },
      })),
      ...(rowActions
        ? [{ cell: undefined, props: { ...ACTIONS_HEADER_PROPS, screenReaderText: 'Actions' } }]
        : []),
    ],
    [shown, sortProps, widths, setWidth, rowActions],
  );

  const rows = useMemo<DataViewTr[]>(
    () =>
      pageRows.map((obj) => {
        const rowId = getRowId(obj);
        // Rows are keyed by index in PF data view: keying each cell's content by object remounts it when another
        // object moves into the row, so no state (an open kebab, a dialog) carries over to a different object.
        const cells = shown.map((column) => ({
          cell: <Fragment key={rowId}>{column.cell(obj)}</Fragment>,
          props: { ...columnProps(column, false), dataLabel: column.title },
        }));
        return {
          id: rowId,
          row: rowActions
            ? [
                ...cells,
                { cell: <Fragment key={rowId}>{rowActions(obj)}</Fragment>, props: ACTIONS_CELL_PROPS },
              ]
            : cells,
        };
      }),
    [pageRows, shown, getRowId, rowActions],
  );

  if (error) return <>{error}</>;
  if (loaded && (data ?? []).length === 0 && !isFiltered) {
    return <EmptyState variant="sm" titleText={`No ${label} found`} headingLevel="h2" />;
  }

  const colSpan = headers.length;
  const activeState = !loaded ? DataViewState.loading : sorted.length === 0 ? DataViewState.empty : undefined;
  const pagination = (variant: PaginationVariant) => (
    <Pagination
      variant={variant}
      isCompact
      itemCount={sorted.length}
      perPage={perPage}
      page={page}
      onSetPage={(_event, next) => setPaging({ page: next, filterKey })}
      onPerPageSelect={(_event, next) => {
        setPerPage(next);
        setPaging({ page: 1, filterKey });
      }}
      titles={{ paginationAriaLabel: `${label} pagination (${variant})` }}
    />
  );

  return (
    <LabelSuggestionsContext.Provider value={suggestions}>
      <DataView
        activeState={activeState}
        className={filterNodes.length === 1 ? styles.singleFilter : undefined}
      >
        <DataViewToolbar
          clearAllFilters={onClearAllFilters}
          // Our own "Clear filters", so the button always calls the current callback (PF memoises its default).
          customLabelGroupContent={
            <ToolbarItem>
              <Button variant="link" isInline onClick={onClearAllFilters}>
                Clear filters
              </Button>
            </ToolbarItem>
          }
          filters={
            filterNodes.length > 0 && (
              <DataViewFilters
                toggleIcon={<RhUiFilterIcon />}
                values={filterValues}
                onChange={(filterId, values: Record<string, DataViewFilterValue>) =>
                  onFilterChange(filterId, values[filterId])
                }
              >
                {filterNodes}
              </DataViewFilters>
            )
          }
          actions={
            <>
              <Tooltip content="Manage columns">
                <Button
                  variant="plain"
                  aria-label="Column management"
                  icon={<RhUiColumnsIcon />}
                  onClick={() => setManagingColumns(true)}
                />
              </Tooltip>
              {/* Always offered, as in OCP (every titled column is resizable). */}
              <Tooltip content="Reset column widths">
                <Button
                  variant="plain"
                  aria-label="Reset column widths"
                  icon={<RhUiUndoIcon />}
                  onClick={() => {
                    resetWidths();
                    setTableGeneration((generation) => generation + 1);
                  }}
                />
              </Tooltip>
            </>
          }
          pagination={pagination(PaginationVariant.top)}
        />
        <DataViewTable
          // PF keys headers by index and reads their widths on mount: remount when the column set changes.
          key={`${String(tableGeneration)}|${shown.map((column) => column.id).join(',')}`}
          aria-label={label}
          variant="compact"
          gridBreakPoint=""
          isResizable
          columns={headers}
          rows={rows}
          bodyStates={{
            loading: (
              <Tbody>
                <TableSkeletonRows columns={colSpan} />
              </Tbody>
            ),
            empty: <BodyEmpty label={label} colSpan={colSpan} />,
          }}
        />
        {pagination(PaginationVariant.bottom)}
      </DataView>
      {isManagingColumns && (
        <ColumnManagementModal
          columns={managed.filter(({ column }) => column.title)}
          hasNamespaceHint={hasNamespaceHint}
          onSave={setColumnChoice}
          onClose={() => setManagingColumns(false)}
        />
      )}
    </LabelSuggestionsContext.Provider>
  );
}
