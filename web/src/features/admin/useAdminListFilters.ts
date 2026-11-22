import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useUrlFilters, type FilterDefs, type UrlFilters } from '@/shared/table';
import type { DataViewFilterValue } from '@/shared/ui';

/** What {@link useAdminListFilters} returns: the URL filters plus the `ConsoleDataView` filter props. */
export interface AdminListFilters<D extends FilterDefs> extends UrlFilters<D> {
  /** Current value per filter id, for `ConsoleDataView filterValues`. */
  filterValues: Readonly<Record<string, DataViewFilterValue>>;
  /** `ConsoleDataView onFilterChange`: writes one filter's new value to the URL in a single update. */
  onFilterChange: (filterId: string, value: DataViewFilterValue) => void;
  /** Whether any filter applies. */
  isFiltered: boolean;
}

/**
 * URL-backed filters of an admin list (`useUrlFilters`, so deep links such as `?expiry=expired` keep working) wired
 * to `ConsoleDataView`'s filter props. The data view reports a filter's whole new value (a checkbox filter's full
 * selection, a cleared chip group), so it is written in one `setSearchParams` call; values outside a `multi`/`single`
 * def are dropped, a `single` filter keeps the value picked last.
 *
 * Pass `defs` as a module-level constant (see `useUrlFilters`).
 */
export function useAdminListFilters<D extends FilterDefs>(defs: D): AdminListFilters<D> {
  const filters = useUrlFilters(defs);
  const [, setSearchParams] = useSearchParams();

  const onFilterChange = useCallback(
    (filterId: string, value: DataViewFilterValue) => {
      const def = defs[filterId];
      if (!def) return;
      const requested = Array.isArray(value) ? value : value ? [value] : [];
      const allowed = def.kind === 'text' ? requested : requested.filter((v) => def.values.includes(v));
      const next = def.kind === 'single' ? allowed.slice(-1) : allowed;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.delete(filterId);
          for (const v of next) params.append(filterId, v);
          return params;
        },
        { replace: true },
      );
    },
    [defs, setSearchParams],
  );

  return {
    ...filters,
    // `values` is memoised by `useUrlFilters`; its shape (string | string[] | undefined) is a filter value already.
    filterValues: filters.values,
    onFilterChange,
    isFiltered: filters.activeCount > 0,
  };
}
