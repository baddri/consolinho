import { HttpResponse } from 'msw';
import { modelKey, type K8sModel, type K8sResource, type WatchEvent } from '@/shared/k8s';
import type { ObjectPredicate } from './selectors';
import { k8sStatus } from './status';
import { changesSince, compactedResourceVersion, listObjects, subscribe, type StoreChange } from './store';

/** The proxy caps watches at 300 s (contract §3); the mock applies the same cap and default. */
export const MAX_WATCH_SECONDS = 300;

/** What a watch request selects. */
export interface WatchRequest {
  cluster: string;
  model: K8sModel;
  /** `undefined` = all namespaces (or a cluster-scoped kind). */
  namespace: string | undefined;
  /** Label and field selectors combined. */
  matches: ObjectPredicate;
  /** The `resourceVersion` query parameter; absent or `"0"` = start with ADDED for every current object. */
  resourceVersion: string | null;
  timeoutSeconds: number;
  signal: AbortSignal;
}

const encoder = new TextEncoder();

function line(event: WatchEvent<K8sResource>): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

/**
 * Answers a `?watch=1` request like the API server: `200 application/json` whose body is a stream of NDJSON
 * `WatchEvent`s — first the changes after `resourceVersion` (or the current objects as ADDED), then live store
 * changes. The stream ends cleanly after `timeoutSeconds`, when the client aborts, or when the mock is reset; a
 * compacted `resourceVersion` yields a single `ERROR` event with a 410 `Expired` Status.
 */
export function watchResponse(request: WatchRequest): HttpResponse<ReadableStream<Uint8Array>> {
  const key = modelKey(request.model);
  const selected = (change: Pick<StoreChange, 'model' | 'object'>): boolean =>
    modelKey(change.model) === key &&
    (request.namespace === undefined || change.object.metadata.namespace === request.namespace) &&
    request.matches(change.object);

  let cleanup = (): void => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = (): void => undefined;
      // Ends the watch normally after its timeout, like the API server; every other end clears it.
      const timer = setTimeout(
        () => {
          close();
        },
        Math.min(request.timeoutSeconds, MAX_WATCH_SECONDS) * 1000,
      );

      const close = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearTimeout(timer);
        request.signal.removeEventListener('abort', close);
        controller.close();
      };
      const send = (event: WatchEvent<K8sResource>): void => {
        if (!closed) controller.enqueue(line(event));
      };
      cleanup = () => {
        // The consumer cancelled: the controller must not be closed any more, only detached.
        closed = true;
        unsubscribe();
        clearTimeout(timer);
        request.signal.removeEventListener('abort', close);
      };

      // "Flush the headers": MSW's Node interceptor resolves `fetch` only once the body yields a first chunk, while
      // a real API server answers a quiet watch with headers and no body yet. An empty chunk restores that.
      controller.enqueue(new Uint8Array(0));

      if (request.signal.aborted) {
        close();
        return;
      }

      const rv = request.resourceVersion;
      if (rv === null || rv === '' || rv === '0') {
        for (const object of listObjects(request.cluster, request.model, request.namespace)) {
          if (request.matches(object)) send({ type: 'ADDED', object });
        }
      } else {
        const changes = changesSince(request.cluster, Number(rv));
        if (changes === 'expired') {
          send({
            type: 'ERROR',
            object: k8sStatus(
              410,
              'Expired',
              `too old resource version: ${rv} (${compactedResourceVersion(request.cluster)})`,
            ),
          });
          close();
          return;
        }
        for (const change of changes) {
          if (selected(change)) send({ type: change.type, object: change.object });
        }
      }

      unsubscribe = subscribe(request.cluster, {
        onChange: (change) => {
          if (selected(change)) send({ type: change.type, object: change.object });
        },
        close,
      });
      request.signal.addEventListener('abort', close);
    },
    cancel() {
      cleanup();
    },
  });

  return new HttpResponse(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
}
