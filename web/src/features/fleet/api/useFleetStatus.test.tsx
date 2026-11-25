import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ApiError, type AccessibleCluster, type FleetClusterStatus } from '@/shared/api';
import { http, setMockFleetLatency } from '@/test/handlers';
import { server } from '@/test/server';
import { useFleetRows } from './useFleetRows';
import { useFleetStatus } from './useFleetStatus';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cluster = (name: string): AccessibleCluster => ({
  name,
  displayName: name,
  environment: 'development',
  distribution: 'kubernetes',
  accessMode: 'readOnly',
  webConsoleUrl: null,
});

const line = (name: string, checkedAt = '2026-11-25T10:00:00Z'): FleetClusterStatus => ({
  cluster: cluster(name),
  checkedAt,
  failure: null,
  kubernetesVersion: { outcome: 'ok', gitVersion: 'v1.31.4' },
  clusterVersion: null,
  clusterOperators: null,
  nodes: { outcome: 'ok', total: 3, ready: 3, notReady: 0, unschedulable: 0 },
});

/** A fleet stream the test writes to line by line; `signals` holds every request's abort signal. */
function controlledFleet() {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const signals: AbortSignal[] = [];
  const encoder = new TextEncoder();
  server.use(
    http.untyped.get('*/api/fleet/status', ({ request }) => {
      signals.push(request.signal);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push(controller);
          controller.enqueue(new Uint8Array(0));
        },
      });
      return new HttpResponse(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
    }),
  );
  const current = () => {
    const controller = streams.at(-1);
    if (!controller) throw new Error('No fleet request yet');
    return controller;
  };
  return {
    signals,
    requests: () => streams.length,
    send: (status: FleetClusterStatus) =>
      act(() => current().enqueue(encoder.encode(`${JSON.stringify(status)}\n`))),
    end: () => act(() => current().close()),
  };
}

/** Lists `names` as the user's clusters (`GET /api/clusters`). */
function listClusters(...names: string[]) {
  server.use(http.get('/api/clusters', ({ response }) => response(200).json(names.map(cluster))));
}

const rowState = (rows: ReturnType<typeof useFleetRows>['rows']) =>
  rows.map((row) => `${row.cluster.name}:${row.status ? 'line' : row.pending ? 'pending' : 'none'}`);

describe('useFleetRows', () => {
  it('fills rows as lines arrive, keeps the rest pending and drops them when the stream ends', async () => {
    listClusters('a', 'b', 'c');
    const fleet = controlledFleet();
    const { result } = renderHook(() => useFleetRows(), { wrapper });

    await waitFor(() =>
      expect(rowState(result.current.rows)).toEqual(['a:pending', 'b:pending', 'c:pending']),
    );
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.send(line('c'));
    await waitFor(() => expect(rowState(result.current.rows)).toEqual(['a:pending', 'b:pending', 'c:line']));
    fleet.send(line('a'));
    await waitFor(() => expect(rowState(result.current.rows)).toEqual(['a:line', 'b:pending', 'c:line']));
    // A cluster only the stream knows (the list cache predates its grant) is appended.
    fleet.send(line('new'));
    await waitFor(() => expect(rowState(result.current.rows)).toContain('new:line'));

    fleet.end();
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(rowState(result.current.rows)).toEqual(['a:line', 'c:line', 'new:line']);
    expect(result.current.hasCompleted).toBe(true);
  });

  it('keeps the previous lines through a refresh until new ones replace them, and aborts the running stream', async () => {
    listClusters('a', 'b');
    const fleet = controlledFleet();
    const { result } = renderHook(() => useFleetRows(), { wrapper });
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.send(line('a', 'first'));
    fleet.send(line('b', 'first'));
    fleet.end();
    await waitFor(() => expect(result.current.hasCompleted).toBe(true));
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    act(() => result.current.refetch());
    await waitFor(() => expect(fleet.requests()).toBe(2));
    expect(rowState(result.current.rows)).toEqual(['a:line', 'b:line']);
    fleet.send(line('b', 'second'));
    await waitFor(() => expect(result.current.rows[1]?.status?.checkedAt).toBe('second'));
    expect(result.current.rows[0]?.status?.checkedAt).toBe('first');

    // A refresh while streaming aborts the running request; the rows seen so far stay.
    act(() => result.current.refetch());
    await waitFor(() => expect(fleet.requests()).toBe(3));
    expect(fleet.signals[1]?.aborted).toBe(true);
    expect(rowState(result.current.rows)).toEqual(['a:line', 'b:line']);
    fleet.send(line('b', 'third'));
    fleet.end();
    // `a` got no line in the completed stream: it lost access.
    await waitFor(() => expect(rowState(result.current.rows)).toEqual(['b:line']));
  });

  it('aborts the request on unmount', async () => {
    listClusters('a');
    const fleet = controlledFleet();
    const { unmount } = renderHook(() => useFleetStatus(), { wrapper });
    await waitFor(() => expect(fleet.requests()).toBe(1));
    fleet.send(line('a'));

    unmount();
    await waitFor(() => expect(fleet.signals[0]?.aborted).toBe(true));
  });
});

describe('useFleetStatus against the mock backend', () => {
  beforeEach(() => setMockFleetLatency(0));
  afterEach(() => {
    setMockFleetLatency(1);
    globalThis.history.replaceState(null, '', '/');
  });

  it('streams one line per accessible cluster from the scenario table', async () => {
    const { result } = renderHook(() => useFleetStatus(), { wrapper });

    await waitFor(() => expect(result.current.hasCompleted).toBe(true));
    const byName = result.current.byName;
    // The admin's clusters, in the scenarios' delay (= arrival) order.
    expect(Object.keys(byName)).toEqual(['dev-1', 'prod-k8s-1', 'lab-1']);
    expect(byName['dev-1']?.clusterVersion?.currentVersion).toBe('4.18.12');
    expect(byName['prod-k8s-1']?.kubernetesVersion?.gitVersion).toBe('v1.31.4');
    expect(byName['lab-1']?.failure).toBe('timeout');
    expect(result.current.error).toBeNull();
  });

  it('surfaces 503 Fleet.Busy as an ApiError with that code', async () => {
    globalThis.history.replaceState(null, '', '/fleet/overview?mockFleet=busy');
    const { result } = renderHook(() => useFleetStatus(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(503);
    expect(result.current.error?.code).toBe('Fleet.Busy');
    expect(result.current.byName).toEqual({});
  });
});
