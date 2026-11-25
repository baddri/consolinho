import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useUrlFilters, type FilterDef } from '@/shared/table';
import type { DataViewFilterValue } from '@/shared/ui';
import { FLEET_FILTERS, type FleetFilterValues } from './fleetFilters';

/** Result of {@link useFleetFilters}: the URL filter values plus `ConsoleDataView`'s filter props. */
export interface FleetFilters {
  values: FleetFilterValues;
  /** `ConsoleDataView onFilterChange`; also what the summary line's links call with `'status'`. */
  onFilterChange: (filterId: string, value: DataViewFilterValue) => void;
  clearAll: () => void;
  isFiltered: boolean;
}

/**
 * The fleet table's filters in the URL (`useUrlFilters` over {@link FLEET_FILTERS}), wired to `ConsoleDataView` like the
 * admin lists: the data view reports a filter's whole new value, written in one `setSearchParams` call (replace, so
 * filtering doesn't fill the history); values outside a filter's options are dropped.
 */
export function useFleetFilters(): FleetFilters {
  const { values, clearAll, activeCount } = useUrlFilters(FLEET_FILTERS);
  const [, setSearchParams] = useSearchParams();

  const onFilterChange = useCallback(
    (filterId: string, value: DataViewFilterValue) => {
      if (!Object.hasOwn(FLEET_FILTERS, filterId)) return;
      const def: FilterDef = FLEET_FILTERS[filterId as keyof typeof FLEET_FILTERS];
      const requested = Array.isArray(value) ? value : value ? [value] : [];
      const allowed = def.kind === 'text' ? requested : requested.filter((v) => def.values.includes(v));
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.delete(filterId);
          for (const v of allowed) params.append(filterId, v);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { values, onFilterChange, clearAll, isFiltered: activeCount > 0 };
}
