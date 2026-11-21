import { Tooltip } from '@patternfly/react-core';
import { formatAbsoluteTime, formatRelativeTime, useNow } from '@/shared/ui';

/** Props for {@link Timestamp}. */
export interface TimestampProps {
  /** ISO 8601 timestamp from the API; "—" when absent. */
  value: string | undefined;
}

/**
 * A details-page timestamp like OCP's `Timestamp`: the absolute local date and time as text, the relative time ("2
 * hours ago") in a tooltip — the inverse of the list cells' `RelativeTime`. The focusable `<time>` lets keyboard users
 * open the tooltip; the relative text re-renders every minute.
 */
export function Timestamp({ value }: TimestampProps) {
  const now = useNow();
  if (value === undefined) return <>—</>;
  const date = new Date(value);
  // Never hide data: an unparseable value is shown as received.
  if (Number.isNaN(date.getTime())) return <>{value}</>;
  return (
    <Tooltip content={formatRelativeTime(date, now)}>
      {/* A focusable trigger is how PatternFly makes tooltips on static text keyboard-accessible. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <time dateTime={value} tabIndex={0}>
        {formatAbsoluteTime(date)}
      </time>
    </Tooltip>
  );
}
