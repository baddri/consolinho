import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockK8s } from '@/test/handlers';
import { server } from '@/test/server';
import { LOG_BUFFER_LINES, usePodLog, type PodLogSource } from './usePodLog';

/** A running `web` pod that restarted once. */
const POD = 'web-7d4b9c8f6d-8mzrt';
const SEEDED = 10;

const source: PodLogSource = {
  cluster: 'dev-1',
  namespace: 'shop',
  pod: POD,
  container: 'web',
  previous: false,
  showFull: false,
  paused: false,
  isContainerRunning: true,
};

/** Query strings of the log requests made during the test. */
function logRequests(): URLSearchParams[] {
  const seen: URLSearchParams[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/log')) seen.push(url.searchParams);
  });
  return seen;
}

function append(...texts: string[]): void {
  mockK8s.appendLog('dev-1', 'shop', POD, 'web', ...texts);
}

const openStreams = (): number => mockK8s.openLogStreams('dev-1', 'shop', POD, 'web');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  server.events.removeAllListeners();
});

describe('usePodLog', () => {
  it('follows the last 1,000 lines with timestamps and shows appended lines (LOG-3)', async () => {
    const requests = logRequests();
    const { result } = renderHook(() => usePodLog(source));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.lines).toHaveLength(SEEDED));
    expect(result.current.status).toBe('streaming');
    expect(Object.fromEntries(requests[0] ?? [])).toEqual({
      container: 'web',
      follow: 'true',
      tailLines: '1000',
      timestamps: 'true',
    });

    append('first live line');
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.lines.at(-1)).toBe('first live line');
  });

  it('caps the buffer at 1,000 lines, counts lines behind while paused, and drops the cap with showFull (LOG-4)', async () => {
    const { result, rerender } = renderHook((props: PodLogSource) => usePodLog(props), {
      initialProps: source,
    });
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    append(...Array.from({ length: 1100 }, (_, i) => `line ${i}`));
    await waitFor(() => expect(result.current.lines.at(-1)).toBe('line 1099'));
    expect(result.current.lines).toHaveLength(LOG_BUFFER_LINES);

    rerender({ ...source, paused: true });
    expect(result.current.status).toBe('paused');
    append('a', 'b', 'c');
    await waitFor(() => expect(result.current.linesBehind).toBe(3));
    expect(result.current.lines.at(-1)).toBe('line 1099');
    rerender(source);
    expect(result.current.linesBehind).toBe(0);
    expect(result.current.lines.at(-1)).toBe('c');

    const requests = logRequests();
    rerender({ ...source, showFull: true });
    await waitFor(() => expect(result.current.lines).toHaveLength(SEEDED + 1103));
    expect(requests[0]?.has('tailLines')).toBe(false);
  });

  it('requests the previous log and ends with EOF (LOG-5)', async () => {
    const requests = logRequests();
    const { result } = renderHook(() => usePodLog({ ...source, previous: true }));
    await waitFor(() => expect(result.current.status).toBe('eof'));
    expect(requests[0]?.get('previous')).toBe('true');
    expect(result.current.lines.at(-1)).toBe('panic: database unavailable');
    expect(result.current.error).toBeUndefined();
  });

  it('resumes a cut stream with sinceTime without duplicating or losing lines (LOG-6)', async () => {
    const requests = logRequests();
    const { result } = renderHook(() => usePodLog(source));
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    // The fake clock stands still, so these lines share one timestamp: the resume must skip exactly three of them.
    append('a', 'b', 'c');
    await waitFor(() => expect(result.current.lines.at(-1)).toBe('c'));

    mockK8s.cutLog('dev-1', 'shop', POD, 'web');
    append('d'); // written while no stream is open
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await waitFor(() => expect(result.current.lines.at(-1)).toBe('d'));
    append('e');
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(result.current.lines.slice(SEEDED)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.get('sinceTime')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(requests[1]?.has('tailLines')).toBe(false);
    expect(result.current.status).toBe('streaming');
  });

  it('ends with EOF when the container stopped running', async () => {
    const { result, rerender } = renderHook((props: PodLogSource) => usePodLog(props), {
      initialProps: source,
    });
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    rerender({ ...source, isContainerRunning: false });
    mockK8s.endLog('dev-1', 'shop', POD, 'web');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await waitFor(() => expect(result.current.status).toBe('eof'));
    expect(result.current.error).toBeUndefined();
  });

  it('backs off 1 s, 2 s, 4 s, 5 s on immediate failures and gives up with an error after 5', async () => {
    const times: number[] = [];
    server.use(
      http.get('*/api/clusters/:cluster/k8s/*', () => {
        times.push(Date.now());
        return HttpResponse.error();
      }),
    );
    const { result } = renderHook(() => usePodLog(source));
    await waitFor(() => expect(times).toHaveLength(1));
    // Steps the fake clock until all five attempts were made (bounded: 20 s of fake time).
    for (let step = 0; step < 200 && times.length < 5; step++) {
      await act(() => vi.advanceTimersByTimeAsync(100));
    }
    await waitFor(() => expect(result.current.status).toBe('eof'));
    expect(result.current.error).toMatchObject({ status: 0 });
    // The fake clock also runs in real time, so each gap may be a little longer than the delay, never shorter.
    const gaps = times.slice(1).map((time, i) => time - (times[i] ?? 0));
    [1000, 2000, 4000, 5000].forEach((delay, i) => {
      expect(gaps[i]).toBeGreaterThanOrEqual(delay);
      expect(gaps[i]).toBeLessThan(delay + 1000);
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(times).toHaveLength(5);
  });

  it('surfaces a 403 with the cluster message and releases the stream on unmount (LOG-10)', async () => {
    server.use(
      http.get('*/api/clusters/:cluster/k8s/*', () =>
        HttpResponse.json(
          {
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            reason: 'Forbidden',
            code: 403,
            message: 'pods "web" is forbidden: cannot get resource "pods/log"',
          },
          { status: 403 },
        ),
      ),
    );
    const denied = renderHook(() => usePodLog(source));
    await waitFor(() => expect(denied.result.current.error).toBeDefined());
    expect(denied.result.current.status).toBe('eof');
    expect(denied.result.current.error?.detail).toContain('cannot get resource "pods/log"');
    denied.unmount();

    server.resetHandlers();
    const { result, unmount } = renderHook(() => usePodLog(source));
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    expect(openStreams()).toBe(1);
    unmount();
    await waitFor(() => expect(openStreams()).toBe(0));
  });
});
