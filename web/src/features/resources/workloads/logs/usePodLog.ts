import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from '@/shared/api';
import { logTimeKey, logTimeToSecond, podLogPath, streamPodLog, type LogLine } from '@/shared/k8s';

/** Lines kept unless "Show full log" (OCP `resource-log.tsx` `LOG_BUFFER_SIZE`); also the first request's `tailLines`. */
export const LOG_BUFFER_LINES = 1000;
/** Lines arriving together are rendered together, not one render per line (OCP batches the same way). */
const FLUSH_MS = 50;
/** Reconnect delay after a cut or broken stream, doubled per immediate failure up to {@link RETRY_MAX_MS}. */
const RETRY_MS = 1000;
const RETRY_MAX_MS = 5000;
/** Immediate failures in a row after which the stream gives up. */
const MAX_FAILURES = 5;
/** A stream that lasted this long (or delivered a line) was healthy: its end is not an immediate failure. */
const HEALTHY_MS = 5000;

/** What {@link usePodLog} streams. */
export interface PodLogSource {
  cluster: string;
  namespace: string;
  pod: string;
  container: string;
  /** The previous, terminated instance's log (`previous=true`); it ends with EOF and is never resumed. */
  previous: boolean;
  /** "Show full log": no `tailLines` and no cap on the kept lines (unbounded in memory, as OCP). */
  showFull: boolean;
  /** Freezes the returned lines; new ones keep arriving and are counted in `linesBehind`. */
  paused: boolean;
  /**
   * Whether the live pod (the caller's `useK8sGet`) shows the container running. Read when a stream ends: running →
   * resume, else the log is at its end. Changing it does not restart the stream.
   */
  isContainerRunning: boolean;
}

/** `loading` until the API server accepts the request; `eof` when the log ended, or failed (`error`). */
export type PodLogStatus = 'loading' | 'streaming' | 'paused' | 'eof';

/** Result of {@link usePodLog}. */
export interface PodLog {
  /** The kept lines (timestamps stripped), oldest first; a frozen snapshot while paused. */
  lines: readonly string[];
  status: PodLogStatus;
  /** Lines that arrived since pausing. */
  linesBehind: number;
  /** Why the stream stopped: an HTTP error (403, 400 "container … is waiting to start") or giving up after repeated failures. */
  error?: ApiError;
  /** Starts the stream again from scratch (after an error or EOF). */
  reconnect: () => void;
}

/** What a running stream reports to the hook. */
interface LogSink {
  open: () => void;
  line: (text: string) => void;
  end: (error?: ApiError) => void;
}

/**
 * Where a resumed stream continues (LOG-6, ADR-0037 §6). `sinceTime` has second precision, so the resumed stream
 * repeats lines already shown: the filter drops lines older than the last timestamp seen and the first *k* lines at
 * exactly that timestamp, *k* being how many were already shown at it.
 */
class ResumePoint {
  private lastTs = '';
  private lastKey = '';
  private atLast = 0;

  /** Records a shown line. */
  shown(line: LogLine): void {
    const key = logTimeKey(line.ts);
    if (key === '') return;
    if (key === this.lastKey) {
      this.atLast++;
    } else {
      this.lastKey = key;
      this.lastTs = line.ts;
      this.atLast = 1;
    }
  }

  /** `sinceTime` of the next request; `undefined` before any timestamped line (then nothing was shown to repeat). */
  sinceTime(): string | undefined {
    return this.lastTs ? logTimeToSecond(this.lastTs) : undefined;
  }

  /** A filter for one resumed stream: `true` for lines not shown yet. */
  newLines(): (line: LogLine) => boolean {
    const { lastKey, atLast } = this;
    let skipping = lastKey !== '';
    let repeated = 0;
    return (line) => {
      if (!skipping) return true;
      const key = logTimeKey(line.ts);
      if (key === '' || key < lastKey) return false;
      if (key === lastKey && repeated < atLast) {
        repeated++;
        return false;
      }
      skipping = false;
      return true;
    };
  }
}

/** Resolves after `ms` with `true`, or at once with `false` when `signal` aborts. */
function delay(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve(!signal.aborted);
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}

/** A client error (403, 400 waiting, 404) won't change by retrying; a broken stream (0) or a 5xx may. */
function isRetryable(error: ApiError): boolean {
  return error.status === 0 || error.status >= 500;
}

/**
 * Follows one container log until it ends: streams it, and when the stream ends or breaks while the container still
 * runs (the proxy cuts followed logs at ~5.5 min, ADR-0036 §1) reconnects after 1 s with `sinceTime`, without
 * duplicating or losing lines. Immediate failures back off 1 s → 5 s and give up after {@link MAX_FAILURES} with an error.
 */
async function followPodLog(
  source: Omit<PodLogSource, 'paused' | 'isContainerRunning'>,
  isRunning: () => boolean,
  signal: AbortSignal,
  sink: LogSink,
): Promise<void> {
  const resume = new ResumePoint();
  let failures = 0;
  for (;;) {
    const sinceTime = resume.sinceTime();
    const path = podLogPath(source.cluster, source.namespace, source.pod, {
      container: source.container,
      previous: source.previous,
      follow: true,
      timestamps: true,
      // A resumed stream starts at `sinceTime`; the tail would repeat or skip lines.
      tailLines: source.showFull || sinceTime !== undefined ? undefined : LOG_BUFFER_LINES,
      sinceTime,
    });
    const isNew = resume.newLines();
    const opened = Date.now();
    let delivered = false;
    let failure: ApiError | undefined;
    try {
      for await (const line of streamPodLog(path, signal, sink.open)) {
        if (!isNew(line)) continue;
        delivered = true;
        resume.shown(line);
        sink.line(line.text);
      }
    } catch (error) {
      if (signal.aborted) return;
      const apiError = isApiError(error)
        ? error
        : new ApiError({ status: 0, title: 'Log stream failed', detail: String(error) });
      if (!isRetryable(apiError)) {
        sink.end(apiError);
        return;
      }
      failure = apiError;
    }
    if (signal.aborted) return;
    if (source.previous) {
      sink.end(failure);
      return;
    }
    failures = delivered || Date.now() - opened >= HEALTHY_MS ? 0 : failures + 1;
    if (failures >= MAX_FAILURES) {
      // Giving up is always an error, even when the stream only kept closing at once without throwing.
      sink.end(
        failure ??
          new ApiError({
            status: 0,
            title: 'Log stream failed',
            detail: 'The log stream kept closing; it was stopped.',
          }),
      );
      return;
    }
    if (!(await delay(Math.min(RETRY_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS), signal))) return;
    // Checked after the delay: a container that just exited ends its log before the pod watch shows it terminated.
    if (!isRunning()) {
      sink.end();
      return;
    }
  }
}

/** The streamed state of one log session (one source + reconnect count). */
interface Session {
  key: string;
  lines: readonly string[];
  /** Lines received in this session, including those dropped from the buffer. */
  total: number;
  phase: 'loading' | 'streaming' | 'eof';
  error?: ApiError;
}

const NO_LINES: readonly string[] = [];

function emptySession(key: string): Session {
  return { key, lines: NO_LINES, total: 0, phase: 'loading' };
}

/**
 * The data half of the Logs tab (ADR-0037 §6, LOG-3…6): streams a container's log with `follow=true&timestamps=true`
 * and keeps the last {@link LOG_BUFFER_LINES} lines (all with `showFull`), resuming after the proxy's cuts while the
 * container runs. Like OCP `resource-log.tsx`, pausing freezes the shown lines while the stream continues and
 * `linesBehind` counts what arrived. Changing the container, `previous` or `showFull` aborts and starts from scratch;
 * unmounting aborts the stream. Component state, not TanStack Query: a live log is not cacheable server state.
 */
export function usePodLog({
  cluster,
  namespace,
  pod,
  container,
  previous,
  showFull,
  paused,
  isContainerRunning,
}: PodLogSource): PodLog {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([cluster, namespace, pod, container, previous, showFull, attempt]);
  const [session, setSession] = useState<Session>(() => emptySession(key));
  const [frozen, setFrozen] = useState<Session | null>(null);
  const runningRef = useRef(isContainerRunning);
  useEffect(() => {
    runningRef.current = isContainerRunning;
  }, [isContainerRunning]);

  useEffect(() => {
    const sessionKey = JSON.stringify([cluster, namespace, pod, container, previous, showFull, attempt]);
    const controller = new AbortController();
    const buffer: string[] = [];
    let current = emptySession(sessionKey);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = (): void => {
      clearTimeout(timer);
      timer = undefined;
      // Trimmed once per flush, not per line; only the lines of one flush interval exceed the cap meanwhile.
      if (!showFull && buffer.length > LOG_BUFFER_LINES) buffer.splice(0, buffer.length - LOG_BUFFER_LINES);
      current = { ...current, lines: [...buffer] };
      setSession(current);
    };
    const sink: LogSink = {
      open: () => {
        if (current.phase !== 'loading') return;
        current = { ...current, phase: 'streaming' };
        publish();
      },
      line: (text) => {
        buffer.push(text);
        current = { ...current, total: current.total + 1 };
        timer ??= setTimeout(publish, FLUSH_MS);
      },
      end: (error) => {
        current = { ...current, phase: 'eof', ...(error ? { error } : {}) };
        publish();
      },
    };
    const source = { cluster, namespace, pod, container, previous, showFull };
    followPodLog(source, () => runningRef.current, controller.signal, sink).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        sink.end(
          isApiError(error)
            ? error
            : new ApiError({ status: 0, title: 'Log stream failed', detail: String(error) }),
        );
      }
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [cluster, namespace, pod, container, previous, showFull, attempt]);

  const live = session.key === key ? session : emptySession(key);
  // Paused: render the snapshot taken when pausing (derived during render, as OCP does for its line count).
  const freeze = paused && live.phase !== 'eof';
  if (freeze && frozen?.key !== key) setFrozen(live);
  if (!freeze && frozen !== null) setFrozen(null);
  const shown = freeze && frozen?.key === key ? frozen : live;

  const reconnect = useCallback(() => setAttempt((count) => count + 1), []);
  let status: PodLogStatus = live.phase;
  if (live.phase !== 'eof' && paused) status = 'paused';
  return {
    lines: shown.lines,
    status,
    linesBehind: live.total - shown.total,
    ...(live.error ? { error: live.error } : {}),
    reconnect,
  };
}
