import { ApiError, apiErrorFromRejection } from '@/shared/api';
import { k8sFetch, type ListOptions } from './client';
import { k8sErrorFromStatus } from './errors';
import type { K8sModel } from './models';
import { ndjsonLines } from './ndjson';
import type { WatchEvent } from './types';
import { resourceApiPath } from './url';

/** Callbacks of {@link streamWatch}. */
export interface WatchHandlers<T> {
  /** The API server accepted the watch (2xx headers received). */
  onOpen(): void;
  /** One `ADDED` / `MODIFIED` / `DELETED` / `BOOKMARK` event, in stream order. */
  onEvent(event: WatchEvent<T>): void;
}

/**
 * Runs one watch request (contract §3) from `resourceVersion` (`''` = from the current state, starting with an
 * `ADDED` event per object) and feeds its events to `handlers` as they arrive — line by line, never buffering the
 * stream. Resolves when the server ends the stream normally (proxy cap 300 s);
 * throws an `ApiError` for an HTTP error, a network failure or an `ERROR` event (e.g. 410 `Kubernetes.Expired`);
 * rethrows the `AbortError` when `signal` aborts.
 */
export async function streamWatch<T>(
  cluster: string,
  model: K8sModel,
  opts: ListOptions,
  resourceVersion: string,
  signal: AbortSignal,
  handlers: WatchHandlers<T>,
): Promise<void> {
  const path = resourceApiPath(cluster, model, {
    namespace: opts.namespace,
    query: {
      watch: '1',
      allowWatchBookmarks: 'true',
      resourceVersion: resourceVersion === '' ? undefined : resourceVersion,
      labelSelector: opts.labelSelector,
      fieldSelector: opts.fieldSelector,
    },
  });
  const response = await k8sFetch(path, { signal });
  if (!response.body) {
    // A 2xx without a stream is not a watch; failing makes the manager back off instead of re-watching at once.
    throw new ApiError({ status: 0, title: 'Invalid response', detail: 'The watch response had no body.' });
  }
  handlers.onOpen();
  const reader = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(ndjsonLines()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(apiErrorFromRejection);
      if (done) return;
      const event = parseEvent<T>(value);
      if (event.type === 'ERROR') throw k8sErrorFromStatus(event.object);
      handlers.onEvent(event);
    }
  } finally {
    // Ends the request when we stop early (ERROR event, handler threw); a no-op once the stream is done or aborted.
    reader.cancel().catch(() => undefined);
  }
}

/** Parses one NDJSON line; a malformed line is an unreadable response (status 0, retried with backoff). */
function parseEvent<T>(line: string): WatchEvent<T> {
  try {
    return JSON.parse(line) as WatchEvent<T>;
  } catch (error) {
    return apiErrorFromRejection(error);
  }
}
