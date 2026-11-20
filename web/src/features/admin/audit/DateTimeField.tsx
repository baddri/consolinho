import { DatePicker, Split, SplitItem, TimePicker, yyyyMMddFormat } from '@patternfly/react-core';

/** Props for {@link DateTimeField}. */
export interface DateTimeFieldProps {
  /** Accessible name prefix, e.g. "From" → "From date" / "From time". */
  label: string;
  /** ISO 8601 timestamp; `undefined` (or an unparseable value) shows empty inputs. */
  value?: string;
  /**
   * Time (`HH:mm`, local) a newly picked date gets while no time is set: midnight for a lower bound, `23:59` for an
   * upper bound so "To <day>" includes that day.
   */
  defaultTime?: string;
  /** Receives the new ISO timestamp (UTC), or `undefined` when the date is cleared. */
  onChange: (value?: string) => void;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time parts of `value`, or `undefined` when it isn't a timestamp. */
function localParts(value: string | undefined): { date: string; time: string } | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return {
    date: yyyyMMddFormat(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** ISO timestamp of local `date` (yyyy-MM-dd) at `hour`:`minute`, or `undefined` for an incomplete date. */
function toIso(date: string, hour: number, minute: number): string | undefined {
  const match = DATE_PATTERN.exec(date);
  if (!match) return undefined;
  const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute);
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}

/**
 * One bound of the audit log's custom time range: a PF `DatePicker` plus a 24-hour `TimePicker`, edited in local time
 * and reported as an ISO (UTC) timestamp for the URL and the request. The time is disabled until a date is set; a
 * new date keeps the current time (`defaultTime`, midnight unless given, when none is set yet).
 */
export function DateTimeField({ label, value, defaultTime = '00:00', onChange }: DateTimeFieldProps) {
  const parts = localParts(value);
  const [hour, minute] = (parts?.time ?? defaultTime).split(':').map(Number);

  return (
    <Split hasGutter>
      <SplitItem>
        <DatePicker
          aria-label={`${label} date`}
          placeholder="YYYY-MM-DD"
          value={parts?.date ?? ''}
          onChange={(_event, date) => {
            if (date === '') onChange(undefined);
            else {
              const iso = toIso(date, hour ?? 0, minute ?? 0);
              if (iso) onChange(iso);
            }
          }}
        />
      </SplitItem>
      <SplitItem>
        <TimePicker
          aria-label={`${label} time`}
          is24Hour
          isDisabled={!parts}
          time={parts?.time ?? ''}
          onChange={(_event, _time, h, m, _s, isValid) => {
            if (!parts || !isValid || h === undefined || m === undefined) return;
            const iso = toIso(parts.date, h, m);
            if (iso) onChange(iso);
          }}
        />
      </SplitItem>
    </Split>
  );
}
