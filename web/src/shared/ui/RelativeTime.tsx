import { Tooltip } from '@patternfly/react-core';
import { formatAbsoluteTime, formatRelativeTime } from './formatRelativeTime';
import { useNow } from './useNow';
import { DASH } from './dash';

/** Props for {@link RelativeTime}. */
export interface RelativeTimeProps {
  /** ISO 8601 timestamp from the API, or `null` when the event never happened. */
  value: string | null;
  /** Shown for `null` (default "-"), e.g. "Never" for a last login. */
  emptyText?: string;
}

/**
 * A timestamp shown relative to now ("5 minutes ago", "in 3 days" for expiry dates) inside a `<time dateTime>`
 * element, with the absolute local date-time in a tooltip. The text is focusable so keyboard users can open the
 * tooltip too (same pattern as the footer's version label). Re-renders every minute to stay current.
 */
export function RelativeTime({ value, emptyText = DASH }: RelativeTimeProps) {
  const now = useNow();
  if (value === null) {
    return <>{emptyText}</>;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // Never hide data: an unparseable value is shown as received.
    return <>{value}</>;
  }
  return (
    <Tooltip content={formatAbsoluteTime(date)}>
      {/* A focusable trigger is how PatternFly makes tooltips on static text keyboard-accessible. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <time dateTime={value} tabIndex={0}>
        {formatRelativeTime(date, now)}
      </time>
    </Tooltip>
  );
}
