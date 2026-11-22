import { Tooltip } from '@patternfly/react-core';
import { RhUiClockIcon } from '@patternfly/react-icons';
import { isRelativeTimestamp, timestampText, utcTimestampText } from './formatTimestamp';
import styles from './Timestamp.module.css';
import { useTimestampTick } from './timestampTick';

/** `value` as a date; `undefined` when absent or unparseable. */
function parse(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Props for {@link Timestamp}. */
export interface TimestampProps {
  /** ISO 8601 timestamp from the API; "-" when absent, like OCP. */
  value: string | null | undefined;
}

/**
 * OCP `Timestamp` (`console-shared/src/components/datetime/Timestamp.tsx`, `UX.md` §5) for every time of a
 * Kubernetes object (Created cells, "Created at", condition updates): clock icon + the absolute local date and time,
 * relative ("5 minutes ago") only within 10.5 minutes; the UTC time in a tooltip. The focusable `<time>` lets
 * keyboard users open the tooltip; relative text re-renders on the shared 10-second tick so "Just now" moves on; absolute text doesn't re-render.
 */
export function Timestamp({ value }: TimestampProps) {
  const date = parse(value);
  // Ticks (on the one shared timer) only while the text is relative; absolute text never changes again.
  const now = useTimestampTick((current) => date !== undefined && isRelativeTimestamp(date, current));
  if (!value) return <>-</>;
  // Never hide data: an unparseable value is shown as received.
  if (date === undefined) return <>{value}</>;
  return (
    <span className={styles.timestamp}>
      <RhUiClockIcon className={styles.icon} aria-hidden="true" />
      <Tooltip content={utcTimestampText(date)}>
        {/* A focusable trigger is how PatternFly makes tooltips on static text keyboard-accessible. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <time dateTime={value} tabIndex={0}>
          {timestampText(date, now)}
        </time>
      </Tooltip>
    </span>
  );
}
