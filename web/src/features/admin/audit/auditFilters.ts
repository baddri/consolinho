import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AuditCategory } from '@/shared/api';
import type { FilterDefs, FilterOption, FilterValues } from '@/shared/table';
import type { AuditQueryFilters } from '../queryKeys';
import { useAdminListFilters } from '../useAdminListFilters';
import { isTimeRange, resolveRange, TIME_RANGES, type TimeRange } from './timeRange';

const CATEGORIES: readonly AuditCategory[] = ['auth', 'users', 'clusters', 'credentials', 'grants', 'proxy'];

/** Page size of the audit log (contract default; the server allows 1–200). */
export const AUDIT_PAGE_SIZE = 50;

/** The system actor of configuration-driven changes (bootstrap admins, config-seeded clusters). */
export const SYSTEM_ACTOR = 'system (config)';

/**
 * URL filters of `/admin/audit` (`?actor=&user=&category=&cluster=&target=&range=&from=&to=`). `actor`, `user`,
 * `cluster` and `target` are free text (exact match server-side except `target`), so deleted users/clusters stay
 * searchable; `user` is the deep link of the user detail page (USR-7). `from`/`to` are ISO timestamps of a custom
 * range.
 */
export const AUDIT_FILTERS = {
  actor: { kind: 'text' },
  user: { kind: 'text' },
  category: { kind: 'single', values: CATEGORIES },
  cluster: { kind: 'text' },
  target: { kind: 'text' },
  range: { kind: 'single', values: TIME_RANGES },
  from: { kind: 'text' },
  to: { kind: 'text' },
} as const satisfies FilterDefs;

/** Current values of {@link AUDIT_FILTERS}. */
export type AuditFilterValues = FilterValues<typeof AUDIT_FILTERS>;

/** Options of the category filter. */
export const CATEGORY_OPTIONS: FilterOption[] = [
  { value: 'auth', label: 'Authentication' },
  { value: 'users', label: 'Users' },
  { value: 'clusters', label: 'Clusters' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'grants', label: 'Grants' },
  { value: 'proxy', label: 'Proxy' },
];

const toCategory = (value: string | undefined): AuditCategory | undefined =>
  CATEGORIES.find((category) => category === value);

/**
 * Builds the request of `GET /api/admin/audit` (without cursor) from the URL filters at time `now` (epoch ms). Pure;
 * the result is the audit query key's `filters`. Empty values are left out so equal filters give equal keys.
 */
export function toAuditRequest(values: AuditFilterValues, now: number): AuditQueryFilters {
  const { from, to } = resolveRange(values.range, values.from, values.to, now);
  const category = toCategory(values.category);
  const request: AuditQueryFilters = { limit: AUDIT_PAGE_SIZE };
  if (values.actor) request.actor = values.actor;
  if (values.user) request.user = values.user;
  if (category) request.category = category;
  if (values.cluster) request.cluster = values.cluster;
  if (values.target) request.target = values.target;
  if (from) request.from = from;
  if (to) request.to = to;
  return request;
}

/** Stable identity of the applied filters; key the results component with it (see {@link useAuditRequest}). */
export function auditFiltersKey(values: AuditFilterValues): string {
  return JSON.stringify(values);
}

/**
 * The resolved request for `values`, with `now` captured once on mount. Call it in a component keyed by
 * {@link auditFiltersKey}: a filter change remounts it and captures a fresh `now`, while re-renders keep the same
 * `from` — so the query key stays stable and "Load more" pages through one consistent window while new entries
 * arrive (AUD-4).
 */
export function useAuditRequest(values: AuditFilterValues): AuditQueryFilters {
  const [now] = useState(() => Date.now());
  return useMemo(() => toAuditRequest(values, now), [values, now]);
}

/**
 * The time filter as the toolbar shows it: the URL's `range`, or `custom` when only `from`/`to` are present (a
 * hand-written or older deep link), else `undefined` (all time).
 */
export function effectiveRange(values: AuditFilterValues): TimeRange | undefined {
  if (isTimeRange(values.range)) return values.range;
  return values.from || values.to ? 'custom' : undefined;
}

/**
 * URL-backed filter state of the audit log (`useAdminListFilters` over {@link AUDIT_FILTERS}). `setTimeRange` writes `range`
 * and drops `from`/`to` (unless switching to `custom`) in one URL update, which two `useUrlFilters` setters in the
 * same event could not do.
 */
export function useAuditFilters() {
  const filters = useAdminListFilters(AUDIT_FILTERS);
  const [, setSearchParams] = useSearchParams();

  const setTimeRange = useCallback(
    (range?: TimeRange) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (range) next.set('range', range);
          else next.delete('range');
          if (range !== 'custom') {
            next.delete('from');
            next.delete('to');
          }
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { ...filters, setTimeRange };
}

/** What {@link useAuditFilters} returns. */
export type AuditFiltersState = ReturnType<typeof useAuditFilters>;
