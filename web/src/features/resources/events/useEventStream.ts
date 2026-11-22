import { useCallback, useMemo, useState } from 'react';
import { EventModel, useK8sList, type LiveStatus } from '@/shared/k8s';
import { filterEvents, latestEvents, type EventFilters, type EventResource } from './eventStream';

const NO_EVENTS: readonly EventResource[] = [];

/** Options of {@link useEventStream}. */
export interface EventStreamOptions {
  cluster: string;
  /** Namespace to watch; `undefined` for all namespaces. */
  namespace: string | undefined;
  /** Server-side selector, e.g. an object's `involvedObject.uid=…` on its Events tab. */
  fieldSelector?: string;
  /** Client-side filters; keep the object stable (memoised) so the stream isn't refiltered on every render. */
  filters: EventFilters;
}

/** Result of {@link useEventStream}. */
export interface EventStream {
  /** The newest 500 events (`MAX_EVENTS`), sorted, before the filters. */
  all: readonly EventResource[];
  /** {@link all} narrowed by the filters. */
  shown: readonly EventResource[];
  /** Whether new events stream in; `false` while paused. */
  isActive: boolean;
  toggle: () => void;
  isPending: boolean;
  error: unknown;
  liveStatus: LiveStatus;
  refetch: () => void;
}

/**
 * The live event stream of OCP `EventStream` (`public/components/events.tsx`): the shared events watch (`useK8sList`,
 * so one stream per namespace/selector), sorted newest first and capped at 500 (`latestEvents`), then filtered. Pausing
 * freezes a snapshot of the current events, so no new ones appear until play; the watch itself keeps the cache
 * current, so resuming shows the latest events at once. Sorting and filtering are memoised on the watched list, which
 * changes at most once per watch flush (100 ms batches), not once per event.
 */
export function useEventStream({ cluster, namespace, fieldSelector, filters }: EventStreamOptions): EventStream {
  const list = useK8sList<EventResource>(cluster, EventModel, { namespace, fieldSelector });
  const { data, error, isPending, liveStatus } = list;
  const [snapshot, setSnapshot] = useState<readonly EventResource[] | null>(null);
  const live = data ?? NO_EVENTS;
  const source = snapshot ?? live;

  const all = useMemo(() => latestEvents(source), [source]);
  const shown = useMemo(() => filterEvents(all, filters), [all, filters]);
  const toggle = useCallback(() => setSnapshot((current) => (current ? null : live)), [live]);

  return {
    all,
    shown,
    isActive: snapshot === null,
    toggle,
    isPending,
    error,
    liveStatus,
    refetch: () => list.refetch(),
  };
}
