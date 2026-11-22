/** OCP `timestampFor`: relative only while the time is less than 10.5 minutes in the past. */
const RELATIVE_WINDOW_MS = 630_000;
/** OCP `maxClockSkewMS`: up to a minute in the future counts as clock drift ("Just now"). */
const MAX_CLOCK_SKEW_MS = -60_000;
const MINUTE = 60_000;

/** OCP `dateTimeFormatter` ("Nov 17, 2026, 9:54 PM"), in the user's locale and time zone. */
const absoluteFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

/** OCP `utcDateTimeFormatter` ("Nov 17, 2026, 8:54 PM UTC"), the tooltip of a timestamp. */
const utcFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

/** English like the rest of the UI; OCP's `relativeTimeFormatter` ("5 minutes ago", "1 minute ago"). */
const relativeFormat = new Intl.RelativeTimeFormat('en');

/** Whether {@link timestampText} shows `date` relative at `now` (so the text still changes as time passes). */
export function isRelativeTimestamp(date: Date, now: Date): boolean {
  const ago = now.getTime() - date.getTime();
  return ago > MAX_CLOCK_SKEW_MS && ago < RELATIVE_WINDOW_MS;
}

/**
 * The text of an OCP `Timestamp` (`console-shared/src/utils/datetime.ts:timestampFor`) for `date` seen at `now`:
 * "Just now" under a minute (or up to a minute ahead, clock drift), "N minutes ago" up to 10.5 minutes, otherwise the
 * absolute date and time ("Nov 17, 2026, 9:54 PM"). Pure so it can be tested with fixed clocks.
 */
export function timestampText(date: Date, now: Date): string {
  const ago = now.getTime() - date.getTime();
  if (isRelativeTimestamp(date, now)) {
    const minutes = Math.floor(Math.max(ago, 0) / MINUTE);
    return minutes === 0 ? 'Just now' : relativeFormat.format(-minutes, 'minute');
  }
  return absoluteFormat.format(date);
}

/** The UTC date and time with zone ("Nov 17, 2026, 8:54 PM UTC"), as OCP shows in a timestamp's tooltip. */
export function utcTimestampText(date: Date): string {
  return utcFormat.format(date);
}

/**
 * How long ago `date` was, without suffix, in its largest whole unit: "3 days", "1 hour", "5 minutes" (OCP `fromNow`
 * with `omitSuffix`, e.g. an event's "12 times in the last 3 days"). "-" for an invalid or future time.
 */
export function durationText(date: Date, now: Date): string {
  const ago = now.getTime() - date.getTime();
  // Unparseable dates (NaN) and future times read "-", as OCP `timestampFor`/`fromNow`.
  if (Number.isNaN(ago) || ago < 0) return '-';
  const minutes = Math.floor(ago / MINUTE);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return plural(days, 'day');
  if (hours > 0) return plural(hours, 'hour');
  return plural(minutes, 'minute');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
