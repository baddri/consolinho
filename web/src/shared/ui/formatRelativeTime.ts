const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Largest unit first; a unit is used once the distance reaches its size. Days run up to a month so expiry dates
 * read "in 25 days" rather than "in 3 weeks".
 */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', YEAR],
  ['month', MONTH],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
  ['second', SECOND],
];

/** English to match the rest of the UI text; `numeric: 'auto'` gives "now", "yesterday", "tomorrow". */
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "5 minutes ago" / "in 3 days" for `date` as seen at `now`. Pure so it can be unit-tested with fixed clocks.
 *
 * Values are truncated toward zero (5 min 50 s ago → "5 minutes ago"; expiry in 2 days 23 h → "in 2 days"), so a
 * relative time never overstates how much is left.
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  const distance = Math.abs(diff);
  const [unit, size] = UNITS.find(([, unitSize]) => distance >= unitSize) ?? ['second', SECOND];
  // `+ 0` turns -0 into 0, which Intl would otherwise render as "0 seconds ago" instead of "now".
  const value = Math.trunc(diff / size) + 0;
  return relativeFormat.format(value, unit);
}

/** Absolute local date and time in the user's locale, shown in tooltips next to relative times. */
const absoluteFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

/** Formats `date` as an absolute local date-time (e.g. "Nov 19, 2026, 2:05:00 PM"). */
export function formatAbsoluteTime(date: Date): string {
  return absoluteFormat.format(date);
}
