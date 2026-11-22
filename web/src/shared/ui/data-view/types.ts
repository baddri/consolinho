import type { ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { SortValue } from '@/shared/table';

/**
 * Column role, as OCP `ConsoleDataViewColumn.type` (`useConsoleDataViewColumns.ts`): `name` is sticky with a right
 * border and can't be hidden; `namespace` never wraps.
 */
export type DataViewColumnType = 'name' | 'namespace';

/** One column of a {@link ConsoleDataView}. Callbacks use method syntax so `DataViewColumn<Pod>` fits `DataViewColumn<K8sResource>` slots. */
export interface DataViewColumn<T> {
  /** Stable id: sort key, column-management and column-width key. */
  id: string;
  title: string;
  type?: DataViewColumnType;
  cell(obj: T): ReactNode;
  /** Makes the column sortable. */
  sortValue?(obj: T): SortValue;
  /**
   * PF responsive visibility of the header and cells: low-priority columns hide below a breakpoint instead of
   * squeezing the table (`UX.md` §5).
   */
  visibility?: ThProps['visibility'];
  /**
   * Default width in px (PF `resizableProps.width`) until the user resizes the column. Only for a column whose content
   * can't wrap below that width; without it the header's width is measured on mount, from the page width.
   */
  width?: number;
  /** `false`: an additional column, shown only once picked in "Manage columns" (OCP `defaultVisible`). */
  defaultVisible?: boolean;
  /**
   * Listed in "Manage columns" but not rendered right now (OCP: the Namespace column outside "All projects"); the
   * user's choice for it still applies once it is no longer hidden.
   */
  isHidden?: boolean;
}
