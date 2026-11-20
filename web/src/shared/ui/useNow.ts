import { useEffect, useState } from 'react';

/**
 * Current time as a `Date`, refreshed every `intervalMs` (default one minute) so relative times like "5 minutes
 * ago" stay correct on a page left open.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
