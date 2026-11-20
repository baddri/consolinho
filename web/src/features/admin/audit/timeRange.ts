/** Time range presets of the audit log toolbar (`?range=`), plus `custom` (explicit `from`/`to`). */
export const TIME_RANGES = ['1h', '24h', '7d', '30d', 'custom'] as const;

/** One value of {@link TIME_RANGES}. */
export type TimeRange = (typeof TIME_RANGES)[number];

/** Preset durations in milliseconds. */
const PRESET_MS: Record<Exclude<TimeRange, 'custom'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

/** Menu and label text per range. */
export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

/** Narrows a URL value to a {@link TimeRange}. */
export function isTimeRange(value: string | undefined): value is TimeRange {
  return TIME_RANGES.some((range) => range === value);
}

/** The `from`/`to` query parameters of a resolved time range; absent = unbounded. */
export interface ResolvedRange {
  from?: string;
  to?: string;
}

/**
 * Turns the URL's time filter into the request bounds of `GET /api/admin/audit` (AUD-4). A preset yields only
 * `from = now − duration` (and ignores stray `from`/`to`); `custom` — or no range at all, so a hand-written
 * `?from=` still applies — passes `from`/`to` through unchanged, letting the server reject a malformed timestamp
 * with a 400 the page shows. `now` (epoch ms) is supplied by the caller, captured when the filters change, so the
 * query key stays stable between pages.
 */
export function resolveRange(
  range: string | undefined,
  from: string | undefined,
  to: string | undefined,
  now: number,
): ResolvedRange {
  if (isTimeRange(range) && range !== 'custom') {
    return { from: new Date(now - PRESET_MS[range]).toISOString() };
  }
  const resolved: ResolvedRange = {};
  if (from) resolved.from = from;
  if (to) resolved.to = to;
  return resolved;
}
