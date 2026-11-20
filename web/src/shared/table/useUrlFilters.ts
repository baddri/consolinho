import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Declares one URL-backed filter of an admin list.
 * - `text`: free text (search box), one param, e.g. `?q=alice`.
 * - `multi`: any subset of `values`, as repeated params, e.g. `?env=production&env=staging`.
 * - `single`: at most one of `values`, e.g. `?range=7d`.
 */
export type FilterDef =
  | { kind: 'text' }
  | { kind: 'multi'; values: readonly string[] }
  | { kind: 'single'; values: readonly string[] };

/** Filter definitions keyed by URL search-param name. */
export type FilterDefs = Record<string, FilterDef>;

/** Current value per filter: `string[]` for `multi` (empty = no filter), else `string | undefined`. */
export type FilterValues<D extends FilterDefs> = {
  [K in keyof D]: D[K] extends { kind: 'multi' } ? string[] : string | undefined;
};

type KeysOfKind<D extends FilterDefs, Kind extends FilterDef['kind']> = {
  [K in keyof D]: D[K] extends { kind: Kind } ? K : never;
}[keyof D] &
  string;

/** What {@link useUrlFilters} returns. Setters only accept keys of the matching filter kind. */
export interface UrlFilters<D extends FilterDefs> {
  values: FilterValues<D>;
  /** Sets a `text` filter; an empty string removes the param. */
  setText: (key: KeysOfKind<D, 'text'>, value: string) => void;
  /** Adds or removes one value of a `multi` filter. Values not declared in the def are ignored. */
  toggle: (key: KeysOfKind<D, 'multi'>, value: string) => void;
  /** Sets (or with `undefined` clears) a `single` filter. Values not declared in the def are ignored. */
  setSingle: (key: KeysOfKind<D, 'single'>, value?: string) => void;
  /** Removes one filter from the URL. */
  clear: (key: keyof D & string) => void;
  /** Removes every declared filter; other search params are kept. */
  clearAll: () => void;
  /** Number of applied filter values (each selected `multi` value counts once). 0 = unfiltered list. */
  activeCount: number;
}

/** Reads one filter from the search params, dropping anything the def does not allow. */
function readFilter(params: URLSearchParams, key: string, def: FilterDef): string[] | string | undefined {
  switch (def.kind) {
    case 'text':
      return params.get(key) ?? undefined;
    case 'multi':
      return [...new Set(params.getAll(key).filter((v) => def.values.includes(v)))];
    case 'single':
      return params.getAll(key).find((v) => def.values.includes(v));
  }
}

function countActive(value: string[] | string | undefined): number {
  if (Array.isArray(value)) return value.length;
  return value ? 1 : 0;
}

/**
 * Keeps an admin list's filter state in the URL search params so filtered views are linkable (CRED-8, AUD-4) and
 * survive reload. Writes use `replace: true` (typing in the search box doesn't flood history) and preserve params
 * the hook doesn't own.
 *
 * A hand-edited URL never breaks a page: values not listed in a `multi`/`single` def are ignored on read and
 * dropped on the next write to that filter.
 *
 * Pass `defs` as a module-level constant: `values` is memoised on it, so a new object each render recomputes
 * `values` (and new `multi` arrays) every time.
 *
 * @example
 * const FILTERS = { q: { kind: 'text' }, env: { kind: 'multi', values: ENVIRONMENTS } } as const satisfies FilterDefs;
 * const { values, setText, toggle } = useUrlFilters(FILTERS);
 */
export function useUrlFilters<D extends FilterDefs>(defs: D): UrlFilters<D> {
  const [searchParams, setSearchParams] = useSearchParams();

  const { values, activeCount } = useMemo(() => {
    const result: Record<string, string[] | string | undefined> = {};
    let count = 0;
    for (const [key, def] of Object.entries(defs)) {
      const value = readFilter(searchParams, key, def);
      result[key] = value;
      count += countActive(value);
    }
    // The loop fills exactly the keys of D with the value shape their def kind dictates.
    return { values: result as FilterValues<D>, activeCount: count };
  }, [searchParams, defs]);

  /** Applies `mutate` to a copy of the current params and replaces the history entry. */
  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setText = useCallback(
    (key: string, value: string) =>
      update((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      }),
    [update],
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      const def = defs[key];
      if (def?.kind !== 'multi' || !def.values.includes(value)) return;
      update((params) => {
        const current = readFilter(params, key, def) as string[];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        params.delete(key);
        for (const v of next) params.append(key, v);
      });
    },
    [defs, update],
  );

  const setSingle = useCallback(
    (key: string, value?: string) => {
      const def = defs[key];
      if (def?.kind !== 'single') return;
      if (value !== undefined && !def.values.includes(value)) return;
      update((params) => {
        if (value === undefined) params.delete(key);
        else params.set(key, value);
      });
    },
    [defs, update],
  );

  const clear = useCallback((key: string) => update((params) => params.delete(key)), [update]);

  const clearAll = useCallback(
    () =>
      update((params) => {
        for (const key of Object.keys(defs)) params.delete(key);
      }),
    [defs, update],
  );

  return { values, setText, toggle, setSingle, clear, clearAll, activeCount };
}
