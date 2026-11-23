import { ApiError, isAbortError } from '@/shared/api';
import { k8sFetch } from './client';
import { PodModel } from './models';
import { resourceApiPath } from './url';

/** One line of a container log: its kubelet timestamp (RFC 3339 with nanoseconds, `''` if absent) and its text. */
export interface LogLine {
  ts: string;
  text: string;
}

/** Query of `GET …/pods/<name>/log` (ADR-0037 §6). */
export interface PodLogOptions {
  container: string;
  /** The log of the previous, terminated instance of the container. */
  previous?: boolean;
  follow?: boolean;
  /** Only the last N lines; omitted = the whole log. */
  tailLines?: number;
  /** Lines at or after this RFC 3339 time (the API server truncates it to the second). */
  sinceTime?: string;
  /** Prefix every line with its timestamp; {@link streamPodLog} needs it, Download / View raw leave it off. */
  timestamps?: boolean;
}

/**
 * Proxy path of a container log, for {@link streamPodLog} and for the plain Download / View raw links (LOG-8).
 *
 * @example podLogPath('dev-1', 'shop', 'web-1', { container: 'web', follow: true, tailLines: 1000, timestamps: true })
 */
export function podLogPath(cluster: string, namespace: string, pod: string, opts: PodLogOptions): string {
  return resourceApiPath(cluster, PodModel, {
    namespace,
    name: pod,
    subresource: 'log',
    query: {
      container: opts.container,
      follow: opts.follow ? 'true' : undefined,
      previous: opts.previous ? 'true' : undefined,
      tailLines: opts.tailLines === undefined ? undefined : String(opts.tailLines),
      sinceTime: opts.sinceTime,
      timestamps: opts.timestamps ? 'true' : undefined,
    },
  });
}

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/** Splits the `timestamps=true` prefix off a raw log line; a line without one keeps its text and gets `ts: ''`. */
export function parseLogLine(raw: string): LogLine {
  const space = raw.indexOf(' ');
  const prefix = space < 0 ? raw : raw.slice(0, space);
  if (!TIMESTAMP.test(prefix)) return { ts: '', text: raw };
  return { ts: prefix, text: space < 0 ? '' : raw.slice(space + 1) };
}

/**
 * A sortable key of a log timestamp. RFC 3339 Nano strings don't sort as text: the kubelet trims trailing zeros of
 * the fraction (`…:05.1Z` is after `…:05.12Z` as text) and may use an offset. `''` for a line without a timestamp.
 */
export function logTimeKey(ts: string): string {
  const match = TIMESTAMP.exec(ts);
  if (!match) return '';
  const seconds = Date.parse(`${match[1] ?? ''}${match[3] ?? 'Z'}`) / 1000;
  return `${String(seconds).padStart(12, '0')}.${(match[2] ?? '').padEnd(9, '0')}`;
}

/** `ts` truncated to the second, as `sinceTime` (the API server ignores fractions anyway). */
export function logTimeToSecond(ts: string): string | undefined {
  const match = TIMESTAMP.exec(ts);
  if (!match) return undefined;
  return new Date(`${match[1] ?? ''}${match[3] ?? 'Z'}`).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * A `TransformStream` from decoded text chunks to log lines, without the `\n`. A line split over chunks is held until
 * it completes (only that partial tail is buffered); a final line without `\n` is emitted when the stream ends cleanly.
 * Unlike NDJSON, blank lines are kept: they are part of the log.
 */
function textLines(): TransformStream<string, string> {
  let pending = '';
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) controller.enqueue(line.endsWith('\r') ? line.slice(0, -1) : line);
    },
    flush(controller) {
      if (pending) controller.enqueue(pending);
    },
  });
}

/**
 * Streams one log request (a path from {@link podLogPath} with `timestamps=true`) line by line, never buffering the
 * log. `onOpen` runs once the API server accepted the request (2xx headers). Ends when the server ends the stream —
 * the container stopped, or the proxy cut a followed log at its lifetime (ADR-0036 §1); the caller decides whether to
 * reconnect. Throws an `ApiError` for an HTTP error (e.g. 403, 400 "container … is waiting to start") or a stream that
 * broke off (status 0). An abort of `signal` ends the iteration silently.
 */
export async function* streamPodLog(
  path: string,
  signal: AbortSignal,
  onOpen?: () => void,
): AsyncGenerator<LogLine, void, undefined> {
  let response: Response;
  try {
    response = await k8sFetch(path, { signal });
  } catch (error) {
    if (signal.aborted && isAbortError(error)) return;
    throw error;
  }
  if (!response.body) {
    throw new ApiError({ status: 0, title: 'Invalid response', detail: 'The log response had no body.' });
  }
  onOpen?.();
  const reader = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(textLines()).getReader();
  try {
    for (;;) {
      let next: ReadableStreamReadResult<string>;
      try {
        next = await reader.read();
      } catch {
        if (signal.aborted) return;
        // A reader that rejects mid-stream (the proxy cut it, the network broke): status 0, so the caller may resume.
        throw new ApiError({ status: 0, title: 'Network error', detail: 'The log stream broke off.' });
      }
      if (next.done || signal.aborted) return;
      yield parseLogLine(next.value);
    }
  } finally {
    // Ends the request when the consumer stops early (`break`, unmount); a no-op once the stream is done or aborted.
    reader.cancel().catch(() => undefined);
  }
}
