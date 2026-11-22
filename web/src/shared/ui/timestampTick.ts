import { useEffect, useState } from 'react';

/** How often relative times ("Just now", "N minutes ago", "3 days") re-render, as OCP `useTimestampTick`. */
const TICK_MS = 10_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Subscribes `listener` to the one shared 10-second tick (OCP `console-shared/src/hooks/useTimestampTick.ts`): the
 * interval starts with the first subscriber and stops with the last, so a page of hundreds of timestamps (the event
 * stream) runs a single timer instead of one per row. Returns the unsubscribe function.
 */
export function subscribeTimestampTick(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * The current time, refreshed on the shared {@link subscribeTimestampTick} tick while `isLive(now)` holds. A caller
 * whose text stops changing (a relative time that turned into an absolute date) returns `false` and stops
 * re-rendering; the default stays live.
 */
export function useTimestampTick(isLive: (now: Date) => boolean = alwaysLive): Date {
  const [now, setNow] = useState(() => new Date());
  const live = isLive(now);
  useEffect(() => {
    if (!live) return undefined;
    return subscribeTimestampTick(() => setNow(new Date()));
  }, [live]);
  return now;
}

function alwaysLive(): boolean {
  return true;
}
