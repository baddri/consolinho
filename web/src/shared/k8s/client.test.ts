import { http, HttpResponse } from 'msw';
import { ApiError } from '@/shared/api';
import { mockK8s, problem } from '@/test/handlers';
import { server } from '@/test/server';
import { k8sDelete, k8sGet, k8sListAll, k8sUpdate } from './client';
import { ConfigMapModel, NamespaceModel, PodModel } from './models';
import type { ConfigMap, K8sResource, Pod } from './types';
import { resourceApiPath } from './url';

const PROXY = '*/api/clusters/:cluster/k8s/*';

/** Records the URLs of every proxy GET for the rest of the test. */
function recordGets(): URL[] {
  const urls: URL[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (request.method === 'GET' && request.url.includes('/k8s/')) urls.push(new URL(request.url));
  };
  server.events.on('request:start', listener);
  onTestFinished(() => server.events.removeListener('request:start', listener));
  return urls;
}

/** The rejection of `promise`, which must reject. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail('expected a rejection'),
    (error: unknown) => error,
  );
}

describe('resourceApiPath', () => {
  it('builds core, group, namespaced and cluster-scoped paths with the query', () => {
    expect(resourceApiPath('dev 1', PodModel, { namespace: 'shop', query: { limit: '250', continue: undefined } })).toBe(
      '/api/clusters/dev%201/k8s/api/v1/namespaces/shop/pods?limit=250',
    );
    expect(resourceApiPath('dev-1', NamespaceModel, { namespace: 'ignored', name: 'shop' })).toBe(
      '/api/clusters/dev-1/k8s/api/v1/namespaces/shop',
    );
  });
});

describe('k8s error mapping', () => {
  it('maps proxy ProblemDetails, Kubernetes Status and network failures to ApiError', async () => {
    server.use(
      http.get(PROXY, () =>
        problem(502, { code: 'Proxy.CredentialRejected', detail: 'The cluster rejected the credential.' }),
      ),
    );
    expect(await rejection(k8sGet('dev-1', ConfigMapModel, 'shop', 'web-config'))).toMatchObject({
      status: 502,
      code: 'Proxy.CredentialRejected',
      detail: 'The cluster rejected the credential.',
    });

    server.use(http.get(PROXY, () => HttpResponse.error()));
    const network = await rejection(k8sGet('dev-1', ConfigMapModel, 'shop', 'web-config'));
    expect(network).toBeInstanceOf(ApiError);
    expect(network).toMatchObject({ status: 0, title: 'Network error' });
  });

  it('maps a 409 Conflict and a 403 Forbidden Status from the cluster', async () => {
    const stored = await k8sGet<ConfigMap & K8sResource>('dev-1', ConfigMapModel, 'shop', 'web-config');
    await k8sUpdate('dev-1', ConfigMapModel, { ...stored, data: { LOG_LEVEL: 'debug' } });
    expect(await rejection(k8sUpdate('dev-1', ConfigMapModel, stored))).toMatchObject({
      status: 409,
      code: 'Kubernetes.Conflict',
      title: 'Conflict',
    });

    // admin's dev-1 grant uses an edit credential: namespaces are read-only for it.
    const forbidden = await rejection(k8sDelete('dev-1', NamespaceModel, undefined, 'shop'));
    expect(forbidden).toMatchObject({ status: 403, code: 'Kubernetes.Forbidden', title: 'Forbidden' });
    expect((forbidden as ApiError).detail).toContain('cannot delete resource "namespaces"');
  });

  it('rethrows an abort unchanged', async () => {
    const abort = new AbortController();
    abort.abort();
    expect(await rejection(k8sGet('dev-1', ConfigMapModel, 'shop', 'web-config', abort.signal))).toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('k8sListAll', () => {
  it('pages through 600 pods in 3 requests and returns the last resourceVersion', async () => {
    mockK8s.seedPods('dev-1', 'load', 600);
    const gets = recordGets();

    const list = await k8sListAll<Pod>('dev-1', PodModel, { namespace: 'load' });

    expect(list.items).toHaveLength(600);
    expect(list.items[0]).toMatchObject({ apiVersion: 'v1', kind: 'Pod' });
    expect(gets).toHaveLength(3);
    expect(gets.map((url) => url.searchParams.get('limit'))).toEqual(['250', '250', '250']);
    expect(gets[2]?.searchParams.get('continue')).toBeTruthy();
    // The seeded pods were the last changes, so the list's version is that of the newest pod.
    expect(list.resourceVersion).toBe(list.items.at(-1)?.metadata?.resourceVersion);
  });

  it('restarts once when the continue token expires', async () => {
    mockK8s.seedPods('dev-1', 'load', 300);
    let compacted = false;
    server.use(
      http.get(PROXY, ({ request }) => {
        if (!compacted && new URL(request.url).searchParams.has('continue')) {
          compacted = true;
          mockK8s.compact('dev-1');
        }
        return undefined;
      }),
    );
    const gets = recordGets();

    const list = await k8sListAll<Pod>('dev-1', PodModel, { namespace: 'load' });

    expect(list.items).toHaveLength(300);
    expect(gets).toHaveLength(4);
  });
});
