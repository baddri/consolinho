import type { ThProps } from '@patternfly/react-table';
import { useMemo, useState } from 'react';

/** Sort direction, matching PatternFly's `SortByDirection` values. */
export type SortDirection = 'asc' | 'desc';

/** Active sort column and direction. */
export interface SortState<C extends string> {
  by: C;
  direction: SortDirection;
}

/** A sortable cell value; `null` sorts last in both directions. */
export type SortValue = string | number | null;

/** What {@link useClientSort} returns. */
export interface ClientSort<T, C extends string> {
  /** A sorted copy of the rows (the input array is never mutated). */
  sorted: T[];
  /** Props for `<Th sort={sortProps('name', 0)}>`; `index` is the column's position in the header row. */
  sortProps: (column: C, index: number) => ThProps['sort'];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compares two non-null values ascending: numbers numerically, everything else with locale-aware comparison. */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Sorts a bounded list client-side and wires PatternFly sortable `Th`s to it. Rows with a `null` value in the sort
 * column always go last, whatever the direction (e.g. "never connected" clusters below the rest). Strings are
 * compared like `localeCompare` with numeric collation (`dev-2` before `dev-10`); the sort is stable.
 *
 * `accessors` should be a module-level constant (the sorted array is memoised on it).
 *
 * @example
 * const { sorted, sortProps } = useClientSort(rows, ACCESSORS, { by: 'name', direction: 'asc' });
 * <Th sort={sortProps('name', 0)}>Name</Th>
 */
export function useClientSort<T, C extends string>(
  rows: T[],
  accessors: Record<C, (row: T) => SortValue>,
  initial: SortState<NoInfer<C>>,
): ClientSort<T, C> {
  const [sort, setSort] = useState<SortState<C>>(initial);

  const sorted = useMemo(() => {
    const accessor = accessors[sort.by];
    const factor = sort.direction === 'asc' ? 1 : -1;
    return rows
      .map((row) => ({ row, value: accessor(row) }))
      .sort((a, b) => {
        if (a.value === null || b.value === null) {
          // Nulls last regardless of direction, so they are not multiplied by `factor`.
          return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0);
        }
        return factor * compareValues(a.value, b.value);
      })
      .map(({ row }) => row);
  }, [rows, accessors, sort]);

  const sortProps = (column: C, index: number): ThProps['sort'] => ({
    columnIndex: index,
    // PatternFly marks a column active when `sortBy.index === columnIndex`; inactive columns get no index.
    sortBy: column === sort.by ? { index, direction: sort.direction } : {},
    onSort: (_event, _index, direction) => setSort({ by: column, direction }),
  });

  return { sorted, sortProps };
}
