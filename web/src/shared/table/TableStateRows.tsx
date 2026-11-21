import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Td, Tr, type ThProps } from '@patternfly/react-table';
import type { ComponentType, ReactNode } from 'react';

/** Props for {@link TableSkeletonRows}. */
export interface TableSkeletonRowsProps {
  /** Number of placeholder rows (default 5). */
  rows?: number;
  /** Number of cells per row; match the table's header. */
  columns: number;
  /**
   * `visibility` of the header's responsive columns by column index (e.g. `{ 6: LOW_PRIORITY_COLUMN }`), so the
   * placeholder cells hide together with their headers and the loading table keeps its shape.
   */
  columnVisibility?: Readonly<Partial<Record<number, ThProps['visibility']>>>;
}

/**
 * Loading state for a list table: placeholder rows of PatternFly `Skeleton`s rendered inside `Tbody` while the
 * header stays in place. Screen readers hear "Loading" once, not once per cell.
 */
export function TableSkeletonRows({ rows = 5, columns, columnVisibility }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <Tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Td key={column} visibility={columnVisibility?.[column]}>
              <Skeleton screenreaderText={row === 0 && column === 0 ? 'Loading' : undefined} />
            </Td>
          ))}
        </Tr>
      ))}
    </>
  );
}

/** Props for {@link TableEmptyRow}. */
export interface TableEmptyRowProps {
  /** Number of table columns the row spans. */
  colSpan: number;
  /** Heading, e.g. "No clusters found". */
  title: string;
  body?: ReactNode;
  /** Buttons such as the page's primary action. */
  actions?: ReactNode;
  /** Optional PatternFly icon component, e.g. `SearchIcon` for "no match". */
  icon?: ComponentType;
}

/**
 * Empty state inside a table body (one full-width row), used both for "nothing exists yet" (with the primary
 * action) and, through {@link TableNoMatchRow}, "filtered to nothing". Keeping it in the table keeps the header and
 * toolbar.
 */
export function TableEmptyRow({ colSpan, title, body, actions, icon }: TableEmptyRowProps) {
  return (
    <Tr>
      <Td colSpan={colSpan}>
        <Bullseye>
          <EmptyState variant="sm" titleText={title} headingLevel="h2" icon={icon}>
            {body && <EmptyStateBody>{body}</EmptyStateBody>}
            {actions && (
              <EmptyStateFooter>
                <EmptyStateActions>{actions}</EmptyStateActions>
              </EmptyStateFooter>
            )}
          </EmptyState>
        </Bullseye>
      </Td>
    </Tr>
  );
}

/** Props for {@link TableNoMatchRow}. */
export interface TableNoMatchRowProps {
  /** Number of table columns the row spans. */
  colSpan: number;
  /** Clears every filter of the page (the toolbar's "Clear all filters"). */
  onClearAll: () => void;
}

/**
 * "Filtered to nothing" row with the OCP wording (`UX.md` §5): "No results match the filter criteria" and a
 * "Clear all filters" link button, so every list says the same thing.
 */
export function TableNoMatchRow({ colSpan, onClearAll }: TableNoMatchRowProps) {
  return (
    <TableEmptyRow
      colSpan={colSpan}
      title="No results match the filter criteria"
      icon={SearchIcon}
      actions={
        <Button variant="link" onClick={onClearAll}>
          Clear all filters
        </Button>
      }
    />
  );
}
