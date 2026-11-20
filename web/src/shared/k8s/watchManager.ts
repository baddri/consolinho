import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import type { K8sListData, ListOptions } from './client';
import type { K8sModel } from './models';
import type { ObjectMeta, WatchEvent } from './types';
import { streamWatch } from './watch';

/** Whether a watched list or object is up to date (shown as a "Live" / "Paused — retrying" label). */
export type LiveStatus = 'connecting' | 'live' | 'paused';

/** Events are applied to the cache in one batch per this many milliseconds (ADR-0022 §3). */
export const WATCH_FLUSH_MS = 100;

/** Timing of the watch manager; only tests change it ({@link setWatchTimingForTests}). */
interface WatchTiming {
  flushMs: number;
  /** First retry delay after a failed watch; doubles per failure up to `maxBackoffMs`, reset by a successful connect. */
  initialBackoffMs: number;
  maxBackoffMs: number;
  /** A watch that ends (cleanly or not) sooner than this after opening is a failure, not a successful connect. */
  minStreamMs: number;
}

const DEFAULT_TIMING: WatchTiming = { flushMs: WATCH_FLUSH_MS, initialBackoffMs: 1_000, maxBackoffMs: 30_000, minStreamMs: 1_000 };

let timing: WatchTiming = DEFAULT_TIMING;

/**
 * Shortens the flush interval / backoff for a test, so tests never need longer global timeouts. Returns a function
 * that restores the defaults (call it in `afterEach`).
 */
export function setWatchTimingForTests(overrides: Partial<WatchTiming>): () => void {
  timing = { ...DEFAULT_TIMING, ...overrides };
  return () => {
    timing = DEFAULT_TIMING;
  };
}

/** What a watch keeps live: a list query (`{ items, resourceVersion }`) or a single-object query. */
export interface WatchTarget {
  cluster: string;
  model: K8sModel;
  /** Namespace and selectors of the watch request (a `get` watches `fieldSelector=metadata.name=<name>`). */
  opts: ListOptions;
  /** The query whose data the watch patches; also the identity of the shared stream. */
  queryKey: QueryKey;
  mode: 'list' | 'object';
}

/** The part of an object the manager reads. */
interface WatchedObject {
  metadata?: ObjectMeta;
}

/** One shared watch stream (one per query key, DATA-5). */
interface WatchEntry {
  readonly hash: string;
  readonly target: WatchTarget;
  refCount: number;
  status: LiveStatus;
  /** Aborts the running stream; `undefined` = not watching (before the first list, after 410/403/404/401). */
  controller: AbortController | undefined;
  /** Last `resourceVersion` seen on the stream — where a re-watch continues; `''` = from the current state. */
  streamRv: string;
  /** `resourceVersion` the cached data shows; a `sync` with it while watching is a no-op. */
  cacheRv: string;
  pending: WatchEvent<WatchedObject>[];
  flushTimer: ReturnType<typeof setTimeout> | undefined;
}

/** Identity of an object in a list: its `uid`, else `namespace/name`. */
function objectKey(object: WatchedObject): string {
  return object.metadata?.uid ?? `${object.metadata?.namespace ?? ''}/${object.metadata?.name ?? ''}`;
}

/** Applies a batch of watch events to a cached list (upsert/remove by uid; BOOKMARK only advances the version). */
function applyListEvents(
  list: K8sListData<WatchedObject>,
  events: readonly WatchEvent<WatchedObject>[],
  resourceVersion: string,
): K8sListData<WatchedObject> {
  const changes = events.filter((event) => event.type !== 'BOOKMARK');
  if (changes.length === 0) return { items: list.items, resourceVersion };
  const byKey = new Map(list.items.map((item) => [objectKey(item), item]));
  for (const event of changes) {
    const object = event.object;
    if (event.type === 'DELETED') byKey.delete(objectKey(object));
    else byKey.set(objectKey(object), object);
  }
  return { items: [...byKey.values()], resourceVersion };
}

/** Resolves after `ms`, or at once when `signal` aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * Ref-counted Kubernetes watches of one QueryClient (ADR-0022 §3–4). Hooks `acquire` a watch per query key — two
 * components with the same key share one stream — and `sync` it with the `resourceVersion` of the cached list; the
 * last `release` (unmount, or a key change) aborts it. Events are batched into one `setQueryData` per
 * {@link WATCH_FLUSH_MS}. A clean end of a stream that stayed open re-watches at once from the last version; a
 * failure (or a stream closed within `minStreamMs`) pauses and retries with backoff 1 s → 30 s. 410 relists
 * (`invalidateQueries`); an object watch instead restarts from the current state. 401/403/404 stop (a 401 also
 * refetches, so the global session handler sees it).
 */
export class WatchManager {
  private readonly entries = new Map<string, WatchEntry>();
  private readonly listeners = new Map<string, Set<() => void>>();

  /** @param queryClient the cache the watches patch. */
  constructor(private readonly queryClient: QueryClient) {}

  /** Registers interest in `target`'s watch; returns the (idempotent) release function. */
  acquire(target: WatchTarget): () => void {
    const hash = hashKey(target.queryKey);
    let entry = this.entries.get(hash);
    if (!entry) {
      entry = {
        hash,
        target,
        refCount: 0,
        status: 'connecting',
        controller: undefined,
        streamRv: '',
        cacheRv: '',
        pending: [],
        flushTimer: undefined,
      };
      this.entries.set(hash, entry);
    }
    entry.refCount++;
    const acquired = entry;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      acquired.refCount--;
      if (acquired.refCount === 0) {
        this.halt(acquired);
        this.entries.delete(hash);
        this.notify(hash);
      }
    };
  }

  /**
   * Tells the watch of an acquired `target` which `resourceVersion` its query data has. Starts the stream from it,
   * unless the stream is already running and produced exactly that data (the usual case after a flush); a newer list
   * (relist after 410, manual refetch) restarts the stream from the new version.
   */
  sync(target: WatchTarget, resourceVersion: string): void {
    const entry = this.entries.get(hashKey(target.queryKey));
    if (!entry || (entry.controller && entry.cacheRv === resourceVersion)) return;
    this.halt(entry);
    // An object's own version is usually older than the API server's watch window (a 410 waiting to happen), so an
    // object watch starts from the current state: its synthetic ADDED event re-delivers the object, missing nothing.
    entry.streamRv = entry.target.mode === 'list' ? resourceVersion : '';
    entry.cacheRv = resourceVersion;
    const controller = new AbortController();
    entry.controller = controller;
    void this.run(entry, controller.signal);
  }

  /** Subscribes to {@link getStatus} changes of the watch with query-key hash `hash` (`useSyncExternalStore`). */
  subscribe(hash: string, listener: () => void): () => void {
    let set = this.listeners.get(hash);
    if (!set) {
      set = new Set();
      this.listeners.set(hash, set);
    }
    set.add(listener);
    const subscribed = set;
    return () => {
      subscribed.delete(listener);
      if (subscribed.size === 0) this.listeners.delete(hash);
    };
  }

  /** Live status of the watch with query-key hash `hash`; `'connecting'` when there is none (yet). */
  getStatus(hash: string): LiveStatus {
    return this.entries.get(hash)?.status ?? 'connecting';
  }

  /** The re-watch loop of one stream; ends when `signal` aborts or on a final error. */
  private async run(entry: WatchEntry, signal: AbortSignal): Promise<void> {
    const { cluster, model, opts, queryKey } = entry.target;
    let backoff = timing.initialBackoffMs;
    // A function, not `signal.aborted` inline: the flag flips asynchronously, which control-flow narrowing misses.
    const stopped = (): boolean => signal.aborted;
    while (!stopped()) {
      let openedAt: number | undefined;
      let failure: { error: unknown } | undefined;
      try {
        await streamWatch<WatchedObject>(cluster, model, opts, entry.streamRv, signal, {
          onOpen: () => {
            if (stopped()) return;
            openedAt = Date.now();
            this.setStatus(entry, 'live');
          },
          onEvent: (event) => {
            if (stopped()) return;
            this.enqueue(entry, event);
          },
        });
      } catch (error) {
        failure = { error };
      }
      if (stopped()) return;
      // Only a stream that stayed open counts as a successful connect: one that a proxy closes at once must not turn
      // into a hot reconnect loop, so it neither resets the backoff nor re-watches immediately.
      const lasted = openedAt !== undefined && Date.now() - openedAt >= timing.minStreamMs;
      if (lasted) backoff = timing.initialBackoffMs;
      // A clean end after a healthy stream (the proxy's 300 s cap): re-watch at once from the last version.
      if (!failure && lasted) continue;

      const status = failure && isApiError(failure.error) ? failure.error.status : 0;
      if (status === 410 && entry.target.mode === 'object' && entry.streamRv !== '') {
        // Only one object: re-watch from the current state instead of refetching it. A 410 from the current state
        // itself is not expected and takes the backoff path below, so it can never spin.
        entry.streamRv = '';
        continue;
      }
      if (status === 410 && entry.target.mode === 'list') {
        // History compacted: the list is too old to continue from. Relist; its new version restarts the watch.
        this.halt(entry);
        this.setStatus(entry, 'connecting');
        void this.queryClient.invalidateQueries({ queryKey, exact: true });
        return;
      }
      if (status === 401 || status === 403 || status === 404) {
        this.halt(entry);
        this.setStatus(entry, 'paused');
        // The session ended: a refetch surfaces the 401 to the QueryClient's global handler (→ /login).
        if (status === 401) void this.queryClient.invalidateQueries({ queryKey, exact: true });
        return;
      }
      this.setStatus(entry, 'paused');
      await delay(backoff, signal);
      backoff = Math.min(backoff * 2, timing.maxBackoffMs);
    }
  }

  /** Buffers an event and schedules the batch flush. */
  private enqueue(entry: WatchEntry, event: WatchEvent<WatchedObject>): void {
    const version = event.object.metadata?.resourceVersion;
    if (version) entry.streamRv = version;
    entry.pending.push(event);
    entry.flushTimer ??= setTimeout(() => {
      this.flush(entry);
    }, timing.flushMs);
  }

  /** Applies the buffered events to the query cache in one update. */
  private flush(entry: WatchEntry): void {
    const events = entry.pending;
    entry.pending = [];
    entry.flushTimer = undefined;
    const { queryKey, mode } = entry.target;
    if (mode === 'list') {
      entry.cacheRv = entry.streamRv;
      this.queryClient.setQueryData<K8sListData<WatchedObject>>(queryKey, (list) =>
        list ? applyListEvents(list, events, entry.streamRv) : list,
      );
      return;
    }
    const last = events.filter((event) => event.type !== 'BOOKMARK').at(-1);
    if (!last) return;
    if (last.type === 'DELETED') {
      // Refetch: its 404 drives the page's not-found state.
      void this.queryClient.invalidateQueries({ queryKey, exact: true });
      return;
    }
    const object = last.object;
    entry.cacheRv = object.metadata?.resourceVersion ?? entry.cacheRv;
    this.queryClient.setQueryData(queryKey, object);
  }

  /** Stops the stream and drops buffered events (they predate whatever data comes next). */
  private halt(entry: WatchEntry): void {
    entry.controller?.abort();
    entry.controller = undefined;
    clearTimeout(entry.flushTimer);
    entry.flushTimer = undefined;
    entry.pending = [];
  }

  private setStatus(entry: WatchEntry, status: LiveStatus): void {
    if (entry.status === status) return;
    entry.status = status;
    if (this.entries.get(entry.hash) === entry) this.notify(entry.hash);
  }

  private notify(hash: string): void {
    for (const listener of this.listeners.get(hash) ?? []) listener();
  }
}

const managers = new WeakMap<QueryClient, WatchManager>();

/** The watch manager of `queryClient` (one per client, so tests with fresh clients never share streams). */
export function watchManagerFor(queryClient: QueryClient): WatchManager {
  let manager = managers.get(queryClient);
  if (!manager) {
    manager = new WatchManager(queryClient);
    managers.set(queryClient, manager);
  }
  return manager;
}
