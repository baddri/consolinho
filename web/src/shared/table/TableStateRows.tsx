import {
  Bullseye,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core';
import { Td, Tr } from '@patternfly/react-table';
import type { ComponentType, ReactNode } from 'react';

/** Props for {@link TableSkeletonRows}. */
export interface TableSkeletonRowsProps {
  /** Number of placeholder rows (default 5). */
  rows?: number;
  /** Number of cells per row; match the table's header. */
  columns: number;
}

/**
 * Loading state for a list table: placeholder rows of PatternFly `Skeleton`s rendered inside `Tbody` while the
 * header stays in place. Screen readers hear "Loading" once, not once per cell.
 */
export function TableSkeletonRows({ rows = 5, columns }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <Tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Td key={column}>
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
  /** Heading, e.g. "No clusters registered" or "No users match". */
  title: string;
  body?: ReactNode;
  /** Buttons such as the page's primary action or "Clear filters". */
  actions?: ReactNode;
  /** Optional PatternFly icon component, e.g. `SearchIcon` for "no match". */
  icon?: ComponentType;
}

/**
 * Empty state inside a table body (one full-width row), used both for "nothing exists yet" (with the primary
 * action) and "filtered to nothing" (with "Clear filters"). Keeping it in the table keeps the header and toolbar.
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
