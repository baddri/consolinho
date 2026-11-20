import { Table, Tbody, Td, Th, Thead, Tr, type ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { TableSkeletonRows } from '@/shared/table';
import type { ColumnDef } from '../registry/types';

/** Props for {@link ResourceTable}. */
export interface ResourceTableProps {
  ariaLabel: string;
  /** Visible columns, in order. */
  columns: ColumnDef<K8sResource>[];
  /** The rows of the current page. */
  rows: K8sResource[];
  /** `useClientSort`'s `sortProps`, given the column id and its index. */
  sortProps: (columnId: string, index: number) => ThProps['sort'];
  isPending: boolean;
  /** A `TableEmptyRow` to show instead of rows, if any. */
  emptyRow?: ReactNode;
}

/** Stable React key of a listed object. */
function rowKey(obj: K8sResource): string {
  return obj.metadata.uid ?? `${obj.metadata.namespace ?? ''}/${obj.metadata.name ?? ''}`;
}

/**
 * Compact composable PF table of descriptor columns: sortable headers for columns with `sortValue`, skeleton rows
 * while pending, or the given empty row. Rendering only one page keeps 2,000-object lists responsive (DATA-4).
 */
export function ResourceTable({
  ariaLabel,
  columns,
  rows,
  sortProps,
  isPending,
  emptyRow,
}: ResourceTableProps) {
  return (
    <Table aria-label={ariaLabel} variant="compact">
      <Thead>
        <Tr>
          {columns.map((column, index) => (
            <Th
              key={column.id}
              width={column.width}
              sort={column.sortValue ? sortProps(column.id, index) : undefined}
            >
              {column.title}
            </Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {isPending && <TableSkeletonRows columns={columns.length} />}
        {!isPending && emptyRow}
        {!isPending &&
          !emptyRow &&
          rows.map((obj) => (
            <Tr key={rowKey(obj)}>
              {columns.map((column) => (
                <Td key={column.id} dataLabel={column.title}>
                  {column.cell(obj)}
                </Td>
              ))}
            </Tr>
          ))}
      </Tbody>
    </Table>
  );
}
