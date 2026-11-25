import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { mockDb, mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { useCanI } from './access';
import { useK8sDiscovery } from './discovery';
import { useK8sGet, useK8sList } from './hooks';
import { ConfigMapModel, PodModel, ProjectModel } from './models';
import type { ConfigMap, K8sResource } from './types';
import { setWatchTimingForTests } from './watchManager';

const PROXY = '*/api/clusters/:cluster/k8s/*';

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Proxy traffic of the test: list GETs, watch requests (with their abort state) and SSAR POSTs. */
interface Traffic {
  lists: URL[];
  watches: { url: URL; aborted: () => boolean }[];
  reviews: number;
  openWatches: () => number;
}

/** Spies on proxy requests without answering them (the stateful mock still does). */
function recordTraffic(): Traffic {
  const traffic: Traffic = {
    lists: [],
    watches: [],
    reviews: 0,
    openWatches: () => traffic.watches.filter((watch) => !watch.aborted()).length,
  };
  server.use(
    http.all(PROXY, ({ request }) => {
      const url = new URL(request.url);
      if (request.method === 'POST') traffic.reviews++;
      else if (url.searchParams.has('watch'))
        traffic.watches.push({ url, aborted: () => request.signal.aborted });
      else traffic.lists.push(url);
      return undefined;
    }),
  );
  return traffic;
}

const configMap = (name: string, data: Record<string, string>): K8sResource =>
  ({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name, namespace: 'shop' }, data }) as K8sResource;

/** Answers every watch request with `respond()` (other proxy requests reach the stateful mock). */
function answerWatches(respond: () => Response): void {
  server.use(
    http.get(PROXY, ({ request }) =>
      new URL(request.url).searchParams.has('watch') ? respond() : undefined,
    ),
  );
}

/** Watch timing that makes a hot reconnect loop obvious: 50 ms fixed backoff, streams must last 1 s. */
const SLOW_RETRY = { flushMs: 10, initialBackoffMs: 50, maxBackoffMs: 50, minStreamMs: 1_000 };

/** Upper bound of watch requests in {@link OBSERVE_MS} with {@link SLOW_RETRY} (a hot loop makes hundreds). */
const MAX_BACKED_OFF_WATCHES = 8;
const OBSERVE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const names = (items: readonly ConfigMap[] | undefined) => items?.map((item) => item.metadata?.name);

describe('useK8sList', () => {
  it('applies watched add / modify / delete without refetching', async () => {
    const traffic = recordTraffic();
    const { result } = renderHook(
      () => useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace: 'shop' }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.liveStatus).toBe('live'));
    expect(names(result.current.data)).toContain('web-config');

    mockK8s.upsert('dev-1', configMap('added', { a: '1' }));
    await waitFor(() => expect(names(result.current.data)).toContain('added'));

    mockK8s.upsert('dev-1', configMap('added', { a: '2' }));
    await waitFor(() =>
      expect(result.current.data?.find((item) => item.metadata?.name === 'added')?.data).toEqual({ a: '2' }),
    );

    mockK8s.remove('dev-1', ConfigMapModel, 'shop', 'added');
    await waitFor(() => expect(names(result.current.data)).not.toContain('added'));
    expect(traffic.lists).toHaveLength(1);
    expect(traffic.watches).toHaveLength(1);
  });

  it('relists after compaction (410) and goes live again', async () => {
    let compacted = false;
    server.use(
      http.get(PROXY, ({ request }) => {
        if (!compacted && new URL(request.url).searchParams.has('watch')) {
          compacted = true;
          mockK8s.compact('dev-1');
        }
        return undefined;
      }),
    );
    const traffic = recordTraffic();
    const { result } = renderHook(
      () => useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace: 'shop' }),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(traffic.lists).toHaveLength(2));
    await waitFor(() => expect(result.current.liveStatus).toBe('live'));
    mockK8s.upsert('dev-1', configMap('after-relist', {}));
    await waitFor(() => expect(names(result.current.data)).toContain('after-relist'));
  });

  it('pauses on a watch error and is live again after the backoff reconnect', async () => {
    let failed = false;
    server.use(
      http.get(PROXY, ({ request }) => {
        if (!failed && new URL(request.url).searchParams.has('watch')) {
          failed = true;
          return problem(502, { code: 'Proxy.UpstreamUnavailable', detail: 'dev-1 is not reachable.' });
        }
        return undefined;
      }),
    );
    const statuses: string[] = [];
    const { result } = renderHook(
      () => {
        const list = useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace: 'shop' });
        if (statuses.at(-1) !== list.liveStatus) statuses.push(list.liveStatus);
        return list;
      },
      { wrapper },
    );

    await waitFor(() => expect(statuses).toEqual(['connecting', 'paused', 'live']));
    expect(result.current.error).toBeNull();
  });

  it('shares one stream per key, aborts it on unmount and on a namespace change', async () => {
    const traffic = recordTraffic();
    const { result, rerender, unmount } = renderHook(
      ({ namespace }: { namespace: string }) => [
        useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace }),
        useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace }),
      ],
      { wrapper, initialProps: { namespace: 'shop' } },
    );
    await waitFor(() => expect(result.current.every((list) => list.liveStatus === 'live')).toBe(true));
    expect(traffic.watches).toHaveLength(1);
    expect(traffic.lists).toHaveLength(1);

    rerender({ namespace: 'payments' });
    await waitFor(() => expect(traffic.watches).toHaveLength(2));
    expect(traffic.watches[0]?.aborted()).toBe(true);
    expect(traffic.watches[1]?.url.pathname).toContain('/namespaces/payments/configmaps');
    expect(traffic.openWatches()).toBe(1);

    unmount();
    expect(traffic.openWatches()).toBe(0);
  });
});

describe('watch backoff floor', () => {
  it.each([
    ['a 2xx without a body', () => new HttpResponse(null, { status: 200 })],
    ['a stream that ends at once', () => HttpResponse.text('')],
  ])('backs off instead of re-watching at once after %s', async (_, respond) => {
    setWatchTimingForTests(SLOW_RETRY);
    answerWatches(respond);
    const traffic = recordTraffic();
    const statuses = new Set<string>();
    renderHook(
      () => {
        const list = useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace: 'shop' });
        statuses.add(list.liveStatus);
        return list;
      },
      { wrapper },
    );
    await waitFor(() => expect(traffic.watches.length).toBeGreaterThan(0));

    await sleep(OBSERVE_MS);
    expect(traffic.watches.length).toBeLessThanOrEqual(MAX_BACKED_OFF_WATCHES);
    expect(statuses).toContain('paused');
  });

  it('backs off when an object watch from the current state gets 410', async () => {
    setWatchTimingForTests(SLOW_RETRY);
    const expired = {
      type: 'ERROR',
      object: { kind: 'Status', code: 410, reason: 'Expired', message: 'too old' },
    };
    answerWatches(() => HttpResponse.text(`${JSON.stringify(expired)}\n`));
    const traffic = recordTraffic();
    const { result } = renderHook(() => useK8sGet<ConfigMap>('dev-1', ConfigMapModel, 'shop', 'web-config'), {
      wrapper,
    });
    await waitFor(() => expect(traffic.watches.length).toBeGreaterThan(0));

    await sleep(OBSERVE_MS);
    expect(traffic.watches.length).toBeLessThanOrEqual(MAX_BACKED_OFF_WATCHES);
    expect(traffic.watches.every((watch) => !watch.url.searchParams.has('resourceVersion'))).toBe(true);
    expect(result.current.liveStatus).toBe('paused');
  });
});

describe('useK8sGet', () => {
  it('sees an out-of-band modification through its name-selected watch', async () => {
    const traffic = recordTraffic();
    const { result } = renderHook(() => useK8sGet<ConfigMap>('dev-1', ConfigMapModel, 'shop', 'web-config'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.liveStatus).toBe('live'));
    expect(traffic.watches[0]?.url.searchParams.get('fieldSelector')).toBe('metadata.name=web-config');

    const stored = mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config');
    mockK8s.upsert('dev-1', { ...stored, data: { LOG_LEVEL: 'trace' } } as K8sResource);
    await waitFor(() => expect(result.current.data?.data).toEqual({ LOG_LEVEL: 'trace' }));

    mockK8s.remove('dev-1', ConfigMapModel, 'shop', 'web-config');
    await waitFor(() => expect(result.current.error?.code).toBe('Kubernetes.NotFound'));
  });
});

describe('useK8sDiscovery', () => {
  it('assumes the baseline while pending and hides projects on vanilla lab-1', async () => {
    const credential = {
      ...structuredClone(mockDb.credentials[0]),
      id: 'lab',
      name: 'fleet-admin',
      clusterName: 'lab-1',
    };
    mockDb.credentials.push(credential as (typeof mockDb.credentials)[number]);
    mockDb.grants.push({
      ...structuredClone(mockDb.grants[0]),
      id: 'lab',
      username: 'admin',
      clusterName: 'lab-1',
      credentialId: 'lab',
    } as (typeof mockDb.grants)[number]);

    const { result } = renderHook(() => [useK8sDiscovery('lab-1'), useK8sDiscovery('dev-1')], { wrapper });
    const [lab, dev] = result.current;
    expect(lab?.isPending).toBe(true);
    expect(lab?.isServed(PodModel)).toBe(true);
    expect(dev?.isServed(ProjectModel)).toBe(false);

    await waitFor(() => expect(result.current.every((discovery) => !discovery.isPending)).toBe(true));
    expect(result.current[0]?.isServed(ProjectModel)).toBe(false);
    expect(result.current[0]?.isServed(ConfigMapModel)).toBe(true);
    expect(result.current[1]?.isServed(ProjectModel)).toBe(true);
  });
});

describe('useCanI', () => {
  it('dedupes identical checks into one review and denies delete for a view profile', async () => {
    setMockUser('pending-paul');
    const traffic = recordTraffic();
    const review = { verb: 'delete', model: PodModel, namespace: 'shop' } as const;
    const { result } = renderHook(() => [useCanI('prod-eu-1', review), useCanI('prod-eu-1', review)], {
      wrapper,
    });
    expect(result.current[0]?.allowed).toBeUndefined();

    await waitFor(() => expect(result.current[0]?.isPending).toBe(false));
    expect(result.current.map((check) => check.allowed)).toEqual([false, false]);
    expect(traffic.reviews).toBe(1);
  });

  it('resolves to allowed when the check itself fails', async () => {
    server.use(
      http.post(PROXY, () =>
        problem(502, { code: 'Proxy.UpstreamUnavailable', detail: 'dev-1 is not reachable.' }),
      ),
    );
    const { result } = renderHook(() => useCanI('dev-1', { verb: 'delete', model: PodModel }), { wrapper });
    await waitFor(() => expect(result.current.allowed).toBe(true));
  });
});

/** A component reading a list, for the global 401 handling of the real app runtime. */
function ConfigMapCount() {
  const { data, error } = useK8sList<ConfigMap>('dev-1', ConfigMapModel, { namespace: 'shop' });
  if (error) return <p>{error.code}</p>;
  return <p>{data ? `${data.length} config maps` : 'Loading'}</p>;
}

describe('session handling', () => {
  it(
    'sends a proxy 401 to the global handler (→ /login) but not a 502',
    async () => {
      server.use(
        http.get(
          PROXY,
          () =>
            problem(502, {
              code: 'Proxy.CredentialRejected',
              detail: 'The cluster rejected the credential.',
            }),
          { once: true },
        ),
      );
      const credentialRejected = renderWithProviders(<ConfigMapCount />);
      expect(
        await screen.findByText('Proxy.CredentialRejected', undefined, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeVisible();
      expect(credentialRejected.router.state.location.pathname).toBe('/');
      credentialRejected.unmount();

      setMockUser(null);
      const signedOut = renderWithProviders(<ConfigMapCount />);
      await waitFor(() => expect(signedOut.router.state.location.pathname).toBe('/login'));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
