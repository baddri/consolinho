import { useStoredValue } from '@/shared/hooks';

const WRAP_LINES_KEY = 'fleetconsole.logs.wrapLines';
const SHOW_FULL_LOG_KEY = 'fleetconsole.logs.showFullLog';

const parseFlag = (raw: string): boolean | undefined =>
  raw === 'true' ? true : raw === 'false' ? false : undefined;
const serializeFlag = (value: boolean): string => String(value);

/** The Logs tab's "Wrap lines" and "Show full log" options and their setters. */
export interface LogPreferences {
  wrapLines: boolean;
  setWrapLines: (wrap: boolean) => void;
  showFullLog: boolean;
  setShowFullLog: (full: boolean) => void;
}

/**
 * The log viewer options OCP keeps as user preferences (`console.logs.wrapLines`, `console.logs.showFullLog` in
 * `resource-log.tsx`), remembered per browser in `localStorage`; both off by default.
 */
export function useLogPreferences(): LogPreferences {
  const [wrapLines, setWrapLines] = useStoredValue(WRAP_LINES_KEY, parseFlag, serializeFlag);
  const [showFullLog, setShowFullLog] = useStoredValue(SHOW_FULL_LOG_KEY, parseFlag, serializeFlag);
  return {
    wrapLines: wrapLines ?? false,
    setWrapLines,
    showFullLog: showFullLog ?? false,
    setShowFullLog,
  };
}
