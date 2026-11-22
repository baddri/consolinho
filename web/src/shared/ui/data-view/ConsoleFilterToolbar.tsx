import { Button, ToolbarItem } from '@patternfly/react-core';
import { DataViewFilters, DataViewToolbar } from '@patternfly/react-data-view';
import { RhUiFilterIcon } from '@patternfly/react-icons';
import type { ReactNode } from 'react';

/** A filter's value: text filters hold a string, checkbox filters the selected values. */
export type DataViewFilterValue = string | string[] | undefined;

/** Props for {@link ConsoleFilterToolbar}. */
export interface ConsoleFilterToolbarProps {
  /**
   * Filter elements for `DataViewFilters` (`DataViewTextFilter`, `DataViewLabelFilter`, PF `DataViewCheckboxFilter`),
   * each with `filterId` and `title`. Memoise them: a change of their props resets the selected category.
   */
  filterNodes: ReactNode[];
  /** Current value per `filterId`. */
  filterValues: Readonly<Record<string, DataViewFilterValue>>;
  /** One filter's whole new value (a checkbox filter's full selection, a cleared chip group). */
  onFilterChange: (filterId: string, value: DataViewFilterValue) => void;
  onClearAllFilters: () => void;
  /** Accessible name of the toolbar. */
  'aria-label'?: string;
  /** Plain icon buttons after the filters (OCP: Manage columns, Reset column widths). */
  actions?: ReactNode;
  /** Top pagination, right-aligned. */
  pagination?: ReactNode;
  /** Extra toolbar content after the filters (custom chip groups, non-DataView filters). */
  children?: ReactNode;
}

/**
 * The OCP list toolbar (`ConsoleDataView.tsx` toolbar in the OCP console): category select with the filter icon, the
 * selected category's filter, chips with our own "Clear filters", then actions and pagination. Shared by
 * `ConsoleDataView` and lists that page on the server (the audit log) so both look and behave the same.
 */
export function ConsoleFilterToolbar({
  filterNodes,
  filterValues,
  onFilterChange,
  onClearAllFilters,
  'aria-label': ariaLabel,
  actions,
  pagination,
  children,
}: ConsoleFilterToolbarProps) {
  return (
    <DataViewToolbar
      aria-label={ariaLabel}
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
      actions={actions}
      pagination={pagination}
    >
      {children}
    </DataViewToolbar>
  );
}
