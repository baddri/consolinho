/**
 * Reference time of the fixtures. Fixture timestamps are relative to the moment the mocks are loaded, so expiry
 * statuses ("expires in 5 days") and audit ranges ("last 24 hours") stay meaningful in long-lived dev sessions while
 * the data itself is deterministic.
 */
export const FIXTURE_NOW = Date.now();

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** ISO timestamp `minutes` before {@link FIXTURE_NOW}. */
export function minutesAgo(minutes: number): string {
  return new Date(FIXTURE_NOW - minutes * MINUTE_MS).toISOString();
}

/** ISO timestamp `days` before {@link FIXTURE_NOW}. */
export function daysAgo(days: number): string {
  return new Date(FIXTURE_NOW - days * DAY_MS).toISOString();
}

/** ISO timestamp `days` after {@link FIXTURE_NOW}. */
export function daysFromNow(days: number): string {
  return new Date(FIXTURE_NOW + days * DAY_MS).toISOString();
}

/** One day in milliseconds, for expiry-window arithmetic in handlers. */
export const ONE_DAY_MS = DAY_MS;
