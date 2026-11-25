import { experimental_streamedQuery as streamedQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ApiError, FleetClusterStatus } from '@/shared/api';
import { fetchFleetStatus } from './fleetStatus';

/** Query key of the fleet status stream (`GET /api/fleet/status`); mirrors the URL like every `'api'` key. */
export const fleetStatusQueryKey = ['api', 'fleet', 'status'] as const;

/** Fleet status lines by cluster name. */
export type FleetStatusByName = Readonly<Record<string, FleetClusterStatus>>;

/**
 * Cached state of the stream. `current` holds the lines of the running (or last finished) stream; `previous` the
 * lines of the last *complete* stream, shown until a new line replaces them, so a refresh never blanks the table.
 * Once a stream completes, `previous` no longer counts: a cluster that got no line has lost access (contract §2.2).
 */
export interface FleetStatusData {
  current: FleetStatusByName;
  previous: FleetStatusByName;
  /** The last stream ran to its end. */
  complete: boolean;
  /** Some stream ran to its end; from then on a cluster without a line is not shown (it lost access). */
  settled: boolean;
}

/** What {@link fleetStatusStream} feeds the reducer: stream boundaries around the lines. */
type FleetStreamChunk = { kind: 'start' } | { kind: 'line'; status: FleetClusterStatus } | { kind: 'end' };

const EMPTY: FleetStatusData = { current: {}, previous: {}, complete: false, settled: false };

/**
 * The stream with its boundaries. `start` is yielded with the first line (or the end of an empty body), so a failed
 * refresh (503) keeps the previous data and the old lines stay until new ones come; `end` only when the body ran out,
 * so an aborted stream never counts as complete.
 */
async function* fleetStatusStream(signal: AbortSignal): AsyncGenerator<FleetStreamChunk> {
  const lines = fetchFleetStatus(signal);
  const first = await lines.next();
  yield { kind: 'start' };
  if (first.done) {
    yield { kind: 'end' };
    return;
  }
  yield { kind: 'line', status: first.value };
  for await (const status of lines) yield { kind: 'line', status };
  yield { kind: 'end' };
}

/**
 * Folds chunks into {@link FleetStatusData}. On `start`, the lines shown so far become `previous`: all of the last
 * stream when it completed, else merged over the older ones (an interrupted refresh must not lose rows).
 */
export function reduceFleetStatus(data: FleetStatusData, chunk: FleetStreamChunk): FleetStatusData {
  switch (chunk.kind) {
    case 'start':
      return {
        current: {},
        previous: data.complete ? data.current : { ...data.previous, ...data.current },
        complete: false,
        settled: data.settled,
      };
    case 'line':
      return { ...data, current: { ...data.current, [chunk.status.cluster.name]: chunk.status } };
    case 'end':
      return { ...data, complete: true, settled: true };
  }
}

/** The lines to show: the current stream's, over the last complete stream's until it completes itself. */
function shownLines(data: FleetStatusData): FleetStatusByName {
  return data.complete ? data.current : { ...data.previous, ...data.current };
}

/** Result of {@link useFleetStatus}. */
export interface FleetStatus {
  /** Lines to show: the current stream's, over the previous complete stream's while a refresh runs. */
  byName: FleetStatusByName;
  /**
   * A stream has run to its end, so clusters missing from {@link byName} have no access any more. Stays `true`
   * through later refreshes, so a dropped cluster doesn't come back as "Checking…" every minute.
   */
  hasCompleted: boolean;
  isFetching: boolean;
  error: ApiError | null;
  /** Restarts the stream; a running one is aborted first. */
  refetch: () => void;
  /** When the last line arrived (ms epoch); `0` before any. */
  dataUpdatedAt: number;
}

/**
 * The fleet status of every accessible cluster (FLT-6, ADR-0041), streamed: TanStack `streamedQuery` writes each NDJSON
 * line into the cache as it arrives, so rows fill in progressively. Refreshes every 60 s while the tab is visible and
 * on {@link FleetStatus.refetch}; both keep the previous lines visible until replaced (`refetchMode: 'append'` plus
 * {@link reduceFleetStatus}). Unmount or refetch aborts the request, which cancels the server's probes. No retry: the
 * page shows the error with a Retry button (a 503 `Fleet.Busy` asks the user to wait).
 */
export function useFleetStatus(): FleetStatus {
  const query = useQuery({
    queryKey: fleetStatusQueryKey,
    queryFn: streamedQuery<FleetStreamChunk, FleetStatusData, typeof fleetStatusQueryKey>({
      streamFn: ({ signal }) => fleetStatusStream(signal),
      reducer: reduceFleetStatus,
      initialValue: EMPTY,
      refetchMode: 'append',
    }),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const data = query.data ?? EMPTY;
  const byName = useMemo(() => shownLines(query.data ?? EMPTY), [query.data]);
  const { refetch } = query;
  return {
    byName,
    hasCompleted: data.settled,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void refetch(),
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
