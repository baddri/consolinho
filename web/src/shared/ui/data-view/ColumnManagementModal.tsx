import {
  ColumnManagementModal as PfColumnManagementModal,
  type ColumnManagementModalColumn,
} from '@patternfly/react-component-groups';
import { useMemo } from 'react';
import type { DataViewColumn } from './types';
import { isDefaultColumn, type ColumnChoice } from './useDataViewColumns';

/** Props for {@link ColumnManagementModal}. */
export interface ColumnManagementModalProps<T> {
  /** Every manageable column in its current order, with whether it is shown. */
  columns: { column: DataViewColumn<T>; isShown: boolean }[];
  /** Whether the list has a Namespace column that only all-projects mode shows (OCP adds a hint for it). */
  hasNamespaceHint: boolean;
  onSave: (choice: ColumnChoice) => void;
  onClose: () => void;
}

/**
 * OCP `ConsoleDataViewColumnManagementModal`: PatternFly component-groups' `ColumnManagementModal` ("N selected" bulk
 * select, drag-and-drop order, "Restore default columns"). The Name column can't be hidden; OCP's description shows only the
 * namespace sentence because there is no column limit. Mounted only while open.
 */
export function ColumnManagementModal<T>({ columns, hasNamespaceHint, onSave, onClose }: ColumnManagementModalProps<T>) {
  const applied = useMemo<ColumnManagementModalColumn[]>(
    () =>
      columns.map(({ column, isShown }) => ({
        key: column.id,
        title: column.title,
        isShown,
        isShownByDefault: column.type === 'name' || isDefaultColumn(column),
        isUntoggleable: column.type === 'name',
      })),
    [columns],
  );

  return (
    <PfColumnManagementModal
      isOpen
      enableDragDrop
      resetToDefaultLabel="Restore default columns"
      appliedColumns={applied}
      description={hasNamespaceHint ? 'The namespace column is only shown when in "All projects"' : ''}
      applyColumns={(next) =>
        onSave({
          shown: next.filter((column) => column.isShown).map((column) => column.key),
          hidden: next.filter((column) => !column.isShown).map((column) => column.key),
        })
      }
      onClose={onClose}
    />
  );
}
