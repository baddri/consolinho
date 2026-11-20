import { useCallback, useEffect, useMemo, useRef } from 'react';

/** Result of {@link useTestCancellation}. */
export interface TestCancellation {
  /** Aborts any running test and returns the signal for a new one. */
  start: () => AbortSignal;
  /** Aborts the running test, if any ("Cancel test"). */
  cancel: () => void;
}

/**
 * Owns the `AbortController` of the dialog's running connection test (a test can take ~15 s): "Cancel test" aborts it,
 * a new run aborts the previous one, and unmounting (closing the dialog) aborts whatever is still running, so no
 * result arrives for a dialog that is gone. Nothing retries a cancelled test. The returned object is stable.
 */
export function useTestCancellation(): TestCancellation {
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const start = useCallback(() => {
    cancel();
    const next = new AbortController();
    controller.current = next;
    return next.signal;
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ start, cancel }), [start, cancel]);
}
