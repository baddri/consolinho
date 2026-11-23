import { HttpResponse } from 'msw';
import { logTimeKey, PodModel, type Pod } from '@/shared/k8s';
import { notFound, statusResponse } from './status';
import { getObject, subscribe } from './store';
import type { SubresourceHandler } from './subresources';

/**
 * Container logs of the mock clusters (T-0178, ADR-0037 §8). Every container of a stored pod gets a small seeded log on
 * first read; tests and the dev UI add lines with `mockK8s.appendLog`, which reach every open `follow=true` stream at
 * once. `cutLog` ends open streams the way the proxy cuts a followed log at its lifetime (ADR-0036 §1), so the
 * console's resume with `sinceTime` can be tested; `endLog` also ends the log for good, as when the container stops.
 */

/** One stored line: RFC 3339 Nano timestamp (kubelet style, trailing zeros trimmed) and text. */
interface StoredLine {
  ts: string;
  text: string;
}

/** An open `follow=true` response. */
interface OpenStream {
  send: (line: StoredLine) => void;
  close: () => void;
}

interface ContainerLog {
  lines: StoredLine[];
  /** No more lines will come: follow requests end after the stored lines. */
  ended: boolean;
  streams: Set<OpenStream>;
}

const logs = new Map<string, Map<string, ContainerLog>>();
const encoder = new TextEncoder();

/** Time of `epochMs` as the kubelet writes it: RFC 3339 Nano in UTC with trailing fraction zeros trimmed. */
function kubeletTime(epochMs: number): string {
  return new Date(epochMs)
    .toISOString()
    .replace(/\.(\d*?)0*Z$/, (_, digits: string) => (digits ? `.${digits}Z` : 'Z'));
}

/**
 * The logs of `cluster`. Created with a store listener whose `close` (called by `resetK8sStore`, i.e. `resetMockDb`)
 * ends open log streams and forgets the cluster's logs, so tests start from the seed.
 */
function clusterLogs(cluster: string): Map<string, ContainerLog> {
  let byContainer = logs.get(cluster);
  if (!byContainer) {
    const created = new Map<string, ContainerLog>();
    byContainer = created;
    logs.set(cluster, created);
    subscribe(cluster, {
      onChange: () => undefined,
      close: () => {
        for (const log of created.values()) for (const stream of [...log.streams]) stream.close();
        if (logs.get(cluster) === created) logs.delete(cluster);
      },
    });
  }
  return byContainer;
}

/** A few lines of a web server starting, one to three per second, ending 30 s ago. */
function seedLines(pod: string, container: string): StoredLine[] {
  const start = Date.now() - 60_000;
  const texts = [
    `Starting ${container} in pod ${pod}`,
    'Loading configuration from /etc/app/config.yaml',
    'Connected to database',
    'Listening on :8080',
    'GET /healthz 200 1ms',
    'GET /healthz 200 1ms',
    'GET /api/products 200 12ms',
    '',
    'GET /healthz 200 1ms',
    'GET /api/cart 200 8ms',
  ];
  return texts.map((text, index) => ({ ts: kubeletTime(start + index * 3000 + (index % 3) * 120), text }));
}

/** The previous instance's log: it crashed. */
function previousLines(pod: string, container: string): StoredLine[] {
  const start = Date.now() - 600_000;
  return [
    `Starting ${container} in pod ${pod}`,
    'Connecting to database',
    'error: dial tcp 10.0.0.12:5432: connect: connection refused',
    'panic: database unavailable',
  ].map((text, index) => ({ ts: kubeletTime(start + index * 1500), text }));
}

function containerLog(cluster: string, namespace: string, pod: string, container: string): ContainerLog {
  const byContainer = clusterLogs(cluster);
  const key = `${namespace}/${pod}/${container}`;
  let log = byContainer.get(key);
  if (!log) {
    log = { lines: seedLines(pod, container), ended: false, streams: new Set() };
    byContainer.set(key, log);
  }
  return log;
}

/** A container's state as the kubelet decides whether it has a log. */
function containerState(pod: Pod, container: string) {
  return pod.status?.containerStatuses?.find((status) => status.name === container);
}

/** Reasons of a `waiting` container that never started, so it has no log yet (unlike CrashLoopBackOff). */
const NOT_STARTED = new Set(['ContainerCreating', 'PodInitializing', 'ErrImagePull', 'ImagePullBackOff']);

/** Renders stored lines as the API server does, with or without the timestamp prefix. */
function render(line: StoredLine, timestamps: boolean): Uint8Array {
  return encoder.encode(timestamps ? `${line.ts} ${line.text}\n` : `${line.text}\n`);
}

/** The stored lines a request selects: `sinceTime` (to the second) first, then `tailLines`. */
function selectLines(lines: StoredLine[], query: URLSearchParams): StoredLine[] {
  const since = query.get('sinceTime');
  let selected = lines;
  if (since) {
    const sinceKey = logTimeKey(since);
    selected = selected.filter((line) => logTimeKey(line.ts) >= sinceKey);
  }
  const tail = query.get('tailLines');
  if (tail !== null && /^\d+$/.test(tail))
    selected = selected.slice(Math.max(0, selected.length - Number(tail)));
  return selected;
}

/** A finished log body. */
function textResponse(lines: StoredLine[], timestamps: boolean): Response {
  const chunks = lines.map((line) => render(line, timestamps));
  const body = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new HttpResponse(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

/** A `follow=true` body: the selected lines, then live ones until the log ends, is cut, or the client aborts. */
function followResponse(
  log: ContainerLog,
  initial: StoredLine[],
  timestamps: boolean,
  signal: AbortSignal,
): Response {
  let detach = (): void => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const open: OpenStream = {
        send: (line) => {
          if (!closed) controller.enqueue(render(line, timestamps));
        },
        close: () => {
          if (closed) return;
          detach();
          controller.close();
        },
      };
      detach = () => {
        closed = true;
        log.streams.delete(open);
        signal.removeEventListener('abort', open.close);
      };
      // "Flush the headers" as the mock watch does: MSW's Node interceptor resolves `fetch` only on the first chunk.
      controller.enqueue(new Uint8Array(0));
      for (const line of initial) open.send(line);
      if (log.ended || signal.aborted) {
        open.close();
        return;
      }
      log.streams.add(open);
      signal.addEventListener('abort', open.close);
    },
    cancel() {
      detach();
    },
  });
  // Chunked like the API server (see `watch.ts`: undici asserts on a client abort otherwise).
  return new HttpResponse(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' },
  });
}

/**
 * `GET …/pods/<name>/log`: the container's log like the kubelet serves it — `container` required when the pod has
 * several, 400 for an unknown or not yet started container, `previous=true` a fixed crash log or 400 when the
 * container never restarted. `follow=true` streams live lines while the container runs.
 */
export const podLog: SubresourceHandler = {
  appliesTo: (model) => model.group === '' && model.plural === 'pods',
  serve({ cluster, request, query, namespace, name, verb }) {
    if (verb !== 'get') {
      return statusResponse(
        405,
        'MethodNotAllowed',
        'the server does not allow this method on the requested resource',
      );
    }
    const pod = getObject(cluster, PodModel, namespace, name) as Pod | undefined;
    if (!pod || namespace === undefined) return notFound('pods', name, '');
    const names = (pod.spec?.containers ?? []).map((container) => container.name);
    const container = query.get('container') ?? (names.length === 1 ? names[0] : undefined);
    if (container === undefined) {
      return statusResponse(
        400,
        'BadRequest',
        `a container name must be specified for pod ${name}, choose one of: [${names.join(' ')}]`,
      );
    }
    if (!names.includes(container)) {
      return statusResponse(400, 'BadRequest', `container ${container} is not valid for pod ${name}`);
    }
    const status = containerState(pod, container);
    const timestamps = query.get('timestamps') === 'true';
    if (query.get('previous') === 'true') {
      if (!status || status.restartCount === 0) {
        return statusResponse(
          400,
          'BadRequest',
          `previous terminated container "${container}" in pod "${name}" not found`,
        );
      }
      return textResponse(selectLines(previousLines(name, container), query), timestamps);
    }
    const waiting = status?.state?.waiting?.reason;
    if (!status || (waiting !== undefined && NOT_STARTED.has(waiting))) {
      return statusResponse(
        400,
        'BadRequest',
        `container "${container}" in pod "${name}" is waiting to start: ${waiting ?? 'ContainerCreating'}`,
      );
    }
    const log = containerLog(cluster, namespace, name, container);
    const lines = selectLines(log.lines, query);
    if (query.get('follow') === 'true' && status.state?.running) {
      return followResponse(log, lines, timestamps, request.signal);
    }
    return textResponse(lines, timestamps);
  },
};

/** Test and dev helpers of the mock container logs, merged into `mockK8s`. */
export const mockPodLogs = {
  /**
   * Appends lines to a container's log, timestamped now (lines in the same millisecond share a timestamp, as busy
   * containers' lines do), and sends them to every open follow stream.
   */
  appendLog(cluster: string, namespace: string, pod: string, container: string, ...texts: string[]): void {
    const log = containerLog(cluster, namespace, pod, container);
    for (const text of texts) {
      const last = log.lines.at(-1);
      const now = kubeletTime(Date.now());
      // Never go back in time, even when a test moves the clock.
      const ts = last && logTimeKey(last.ts) > logTimeKey(now) ? last.ts : now;
      const line = { ts, text };
      log.lines.push(line);
      for (const stream of log.streams) stream.send(line);
    }
  },
  /** Ends a container's log: open follow streams close and later ones end after the stored lines. */
  endLog(cluster: string, namespace: string, pod: string, container: string): void {
    const log = containerLog(cluster, namespace, pod, container);
    log.ended = true;
    for (const stream of [...log.streams]) stream.close();
  },
  /** Closes the open follow streams of a container's log mid-stream, as the proxy does at a stream's lifetime. */
  cutLog(cluster: string, namespace: string, pod: string, container: string): void {
    for (const stream of [...containerLog(cluster, namespace, pod, container).streams]) stream.close();
  },
  /** Number of open follow streams of a container's log (asserts that a closed viewer released its stream). */
  openLogStreams(cluster: string, namespace: string, pod: string, container: string): number {
    return containerLog(cluster, namespace, pod, container).streams.size;
  },
};
