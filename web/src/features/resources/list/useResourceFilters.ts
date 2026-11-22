import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { K8sResource } from '@/shared/k8s';
import { matchesText, useUrlFilters, type FilterDefs } from '@/shared/table';
import type { ResourceDescriptor } from '../registry/types';

/** `?name=` (client-side substring) and `?label=` (sent as `labelSelector`), ADR-0023 §2. */
const TEXT_FILTERS = { name: { kind: 'text' }, label: { kind: 'text' } } as const satisfies FilterDefs;

type RowFilterDefs = Record<string, { kind: 'multi'; values: readonly string[] }>;

/** `useUrlFilters` wants stable defs; derive them once per (module-level) descriptor. */
const rowFilterDefsCache = new WeakMap<ResourceDescriptor, RowFilterDefs>();

function rowFilterDefs(descriptor: ResourceDescriptor): RowFilterDefs {
  let defs = rowFilterDefsCache.get(descriptor);
  if (!defs) {
    defs = Object.fromEntries(
      (descriptor.filters ?? []).map((filter) => [
        filter.id,
        { kind: 'multi' as const, values: filter.options.map((option) => option.value) },
      ]),
    );
    rowFilterDefsCache.set(descriptor, defs);
  }
  return defs;
}

/** URL-backed filter state of a resource list. */
export interface ResourceFilters {
  /** `?name=` as typed. */
  name: string;
  /** `?label=` — the applied label selector, `undefined` when none. */
  labelSelector: string | undefined;
  /** Selected values per descriptor filter id (empty = no filter). */
  selected: Record<string, string[]>;
  setName: (value: string) => void;
  setLabelSelector: (value: string) => void;
  /** Replaces the selection of a descriptor filter (a checkbox filter reports its whole selection). */
  setSelected: (filterId: string, values: string[]) => void;
  clearAll: () => void;
  /** True when any filter (name, label or descriptor filter) is applied. */
  isFiltered: boolean;
}

/**
 * Filter state of a resource list page in the URL (`?name=&label=` + the descriptor's `?status=`/`?type=`), so
 * filtered views survive reload and cluster switches (SW-9). `clearAll` removes all of them in one history update.
 */
export function useResourceFilters(descriptor: ResourceDescriptor): ResourceFilters {
  const text = useUrlFilters(TEXT_FILTERS);
  const rows = useUrlFilters(rowFilterDefs(descriptor));
  const [, setSearchParams] = useSearchParams();

  const setSelected = useCallback(
    (filterId: string, values: string[]) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(filterId);
          for (const value of values) next.append(filterId, value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // Two `useUrlFilters` would each write from the same rendered params, so the second write would undo the first.
  const clearAll = useCallback(() => {
    const keys = [...Object.keys(TEXT_FILTERS), ...Object.keys(rowFilterDefs(descriptor))];
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of keys) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [descriptor, setSearchParams]);

  return {
    name: text.values.name ?? '',
    labelSelector: text.values.label,
    selected: rows.values,
    setName: (value) => text.setText('name', value),
    setLabelSelector: (value) => text.setText('label', value.trim()),
    setSelected,
    clearAll,
    isFiltered: text.activeCount + rows.activeCount > 0,
  };
}

/**
 * Rows passing the name substring and every descriptor filter with a selection. Memoised on its inputs; pass the
 * deferred name so typing stays responsive on big lists (DATA-4).
 */
export function useFilteredRows(
  descriptor: ResourceDescriptor,
  rows: K8sResource[],
  name: string,
  selected: Record<string, string[]>,
): K8sResource[] {
  return useMemo(() => {
    const active = (descriptor.filters ?? []).filter((filter) => (selected[filter.id] ?? []).length > 0);
    return rows.filter(
      (obj) =>
        matchesText(name, obj.metadata.name ?? '') &&
        active.every((filter) => filter.matches(obj, selected[filter.id] ?? [])),
    );
  }, [descriptor, rows, name, selected]);
}
