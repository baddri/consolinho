import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { ApiError } from '@/shared/api';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { useCanI } from './access';
import {
  INVENTORY_LIMIT,
  k8sDelete,
  k8sGet,
  k8sGetPath,
  k8sListAll,
  k8sListPage,
  k8sPatch,
  k8sUpdate,
  pageCount,
  type JsonPatchOp,
} from './client';
import { useK8sList } from './hooks';
import { ConfigMapModel, DeploymentModel, NamespaceModel, PodModel } from './models';
import { k8sQueryKeys } from './queryKeys';
import type { ConfigMap, K8sResource, Pod } from './types';
import { resourceApiPath } from './url';
import { setWatchTimingForTests } from './watchManager';

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
    expect(
      resourceApiPath('dev 1', PodModel, { namespace: 'shop', query: { limit: '250', continue: undefined } }),
    ).toBe('/api/clusters/dev%201/k8s/api/v1/namespaces/shop/pods?limit=250');
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
    expect(
      await rejection(k8sGet('dev-1', ConfigMapModel, 'shop', 'web-config', abort.signal)),
    ).toMatchObject({
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

describe('k8sListPage and pageCount (OVW-4)', () => {
  /** Answers every proxy list with two pods and the given list metadata. */
  function answerPage(metadata: { continue?: string; remainingItemCount?: number }) {
    server.use(
      http.get(PROXY, () =>
        HttpResponse.json({
          apiVersion: 'v1',
          kind: 'PodList',
          metadata: { resourceVersion: '7', ...metadata },
          items: [{ metadata: { name: 'a' } }, { metadata: { name: 'b' } }],
        }),
      ),
    );
  }

  it('reads exactly one page with limit and selectors and adds type meta', async () => {
    answerPage({ continue: 'next', remainingItemCount: 998 });
    const gets = recordGets();

    const page = await k8sListPage<Pod>('dev-1', PodModel, {
      namespace: 'shop',
      labelSelector: 'app=web',
      limit: INVENTORY_LIMIT,
    });

    expect(gets).toHaveLength(1);
    expect(gets[0]?.pathname).toBe('/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods');
    expect(gets[0]?.searchParams.get('limit')).toBe('500');
    expect(gets[0]?.searchParams.get('labelSelector')).toBe('app=web');
    expect(page.items[0]).toMatchObject({ apiVersion: 'v1', kind: 'Pod' });
    expect(page).toMatchObject({ continue: 'next', remainingItemCount: 998 });
  });

  it.each([
    [
      'exact with remainingItemCount',
      { continue: 'next', remainingItemCount: 998 },
      { count: 1000, exact: true },
    ],
    ['a lower bound with only continue', { continue: 'next' }, { count: 2, exact: false }],
    ['exact without either (last page)', { continue: '' }, { count: 2, exact: true }],
  ])('counts %s', async (_name, metadata, expected) => {
    answerPage(metadata);
    const page = await k8sListPage<Pod>('dev-1', PodModel, { limit: INVENTORY_LIMIT });
    expect(pageCount(page)).toEqual(expected);
  });
});

/** A fresh query client for one hook test. */
function queryWrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => createElement(QueryClientProvider, { client }, children);
}

describe('subresources and JSON Patch (T-0174)', () => {
  type Deployment = K8sResource & { spec?: { replicas?: number } };
  type Scale = K8sResource & { spec: { replicas: number } };
  const scaleTarget = { namespace: 'shop', name: 'web', subresource: 'scale' };

  /** Records a clone of every proxy PATCH for the rest of the test. */
  function recordPatches(): Request[] {
    const requests: Request[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.method === 'PATCH') requests.push(request.clone());
    };
    server.events.on('request:start', listener);
    onTestFinished(() => server.events.removeListener('request:start', listener));
    return requests;
  }

  it('builds subresource paths with encoded segments and requires a name', () => {
    expect(resourceApiPath('dev-1', DeploymentModel, { ...scaleTarget, name: 'web 1' })).toBe(
      '/api/clusters/dev-1/k8s/apis/apps/v1/namespaces/shop/deployments/web%201/scale',
    );
    expect(
      resourceApiPath('dev-1', PodModel, {
        namespace: 'shop',
        name: 'web',
        subresource: 'log',
        query: { follow: 'true' },
      }),
    ).toBe('/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods/web/log?follow=true');
    expect(() => resourceApiPath('dev-1', PodModel, { namespace: 'shop', subresource: 'exec' })).toThrow();
  });

  it('sends one JSON Patch with the patch content type and the CSRF header', async () => {
    const patches = recordPatches();
    const ops: JsonPatchOp[] = [{ op: 'add', path: '/metadata/labels', value: { tier: 'frontend' } }];

    const patched = await k8sPatch<ConfigMap & K8sResource>(
      'dev-1',
      ConfigMapModel,
      { namespace: 'shop', name: 'web-config' },
      ops,
    );

    expect(patches).toHaveLength(1);
    expect(patches[0]?.headers.get('Content-Type')).toBe('application/json-patch+json');
    expect(patches[0]?.headers.get('X-Console-Request')).toBe('1');
    expect(await patches[0]?.json()).toEqual(ops);
    expect(patched.metadata.labels).toEqual({ tier: 'frontend' });
    expect(mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config')?.metadata.labels).toEqual({
      tier: 'frontend',
    });
  });

  it('updates a live list without a reload', async () => {
    onTestFinished(
      setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
    );
    const { result, unmount } = renderHook(
      () => useK8sList<ConfigMap & K8sResource>('dev-1', ConfigMapModel, { namespace: 'shop' }),
      { wrapper: queryWrapper() },
    );
    onTestFinished(unmount);
    await waitFor(() => expect(result.current.liveStatus).toBe('live'));

    await k8sPatch('dev-1', ConfigMapModel, { namespace: 'shop', name: 'web-config' }, [
      { op: 'add', path: '/data/LOG_LEVEL', value: 'trace' },
    ]);

    await waitFor(() =>
      expect(result.current.data?.find((item) => item.metadata.name === 'web-config')?.data?.LOG_LEVEL).toBe(
        'trace',
      ),
    );
  });

  it('maps a malformed op to 400 and a type error or failed test to 422', async () => {
    const target = { namespace: 'shop', name: 'web-config' };
    const patch = (ops: JsonPatchOp[]) => rejection(k8sPatch('dev-1', ConfigMapModel, target, ops));

    expect(await patch([{ op: 'remove', path: 'no-slash' }])).toMatchObject({ status: 400 });
    expect(await patch([{ op: 'add', path: '/metadata/labels', value: { a: 1 } }])).toMatchObject({
      status: 422,
      code: 'Kubernetes.Invalid',
    });
    expect(await patch([{ op: 'test', path: '/metadata/name', value: 'other' }])).toMatchObject({
      status: 422,
      code: 'Kubernetes.Invalid',
    });
  });

  it('reads and patches the scale subresource of a Deployment', async () => {
    const before = await k8sGetPath<Scale>(resourceApiPath('dev-1', DeploymentModel, scaleTarget));
    expect(before).toMatchObject({ apiVersion: 'autoscaling/v1', kind: 'Scale', spec: { replicas: 3 } });

    const scaled = await k8sPatch<Scale>('dev-1', DeploymentModel, scaleTarget, [
      { op: 'replace', path: '/spec/replicas', value: 5 },
    ]);

    expect(scaled.spec.replicas).toBe(5);
    const stored: Deployment | undefined = mockK8s.get('dev-1', DeploymentModel, 'shop', 'web');
    expect(stored?.spec?.replicas).toBe(5);
    expect(Number(stored?.metadata.resourceVersion)).toBeGreaterThan(Number(before.metadata.resourceVersion));
    const negative = k8sPatch('dev-1', DeploymentModel, scaleTarget, [
      { op: 'replace', path: '/spec/replicas', value: -1 },
    ]);
    expect(await rejection(negative)).toMatchObject({ status: 422 });
  });

  it('denies a read-only grant in the proxy and a view credential in the cluster', async () => {
    const ops: JsonPatchOp[] = [{ op: 'replace', path: '/spec/replicas', value: 0 }];
    setMockUser('alice');
    expect(await rejection(k8sPatch('prod-eu-1', DeploymentModel, scaleTarget, ops))).toMatchObject({
      status: 403,
      code: 'Proxy.ReadOnlyGrant',
    });
    expect(mockK8s.get('prod-eu-1', DeploymentModel, 'shop', 'web')).toMatchObject({
      spec: { replicas: 3 },
    });

    // pending-paul has readWrite through the view-only credential: the proxy lets it through, the cluster denies.
    setMockUser('pending-paul');
    const denied = await rejection(k8sPatch('prod-eu-1', DeploymentModel, scaleTarget, ops));
    expect(denied).toMatchObject({ status: 403, code: 'Kubernetes.Forbidden' });
    expect((denied as ApiError).detail).toContain('cannot patch resource "deployments/scale"');
  });
});

describe('access reviews of subresources', () => {
  const scale = { verb: 'patch', model: DeploymentModel, namespace: 'shop', subresource: 'scale' } as const;

  it('keys each subresource separately', () => {
    const key = k8sQueryKeys.access('dev-1', scale);
    expect(key).not.toEqual(k8sQueryKeys.access('dev-1', { ...scale, subresource: undefined }));
    expect(key).not.toEqual(k8sQueryKeys.access('dev-1', { ...scale, subresource: 'status' }));
  });

  it('sends the subresource in the SelfSubjectAccessReview', async () => {
    const bodies: unknown[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (request.url.includes('selfsubjectaccessreviews')) {
        void request
          .clone()
          .json()
          .then((body: unknown) => bodies.push(body));
      }
    };
    server.events.on('request:start', listener);
    onTestFinished(() => server.events.removeListener('request:start', listener));
    setMockUser('pending-paul');

    const { result } = renderHook(() => useCanI('prod-eu-1', scale), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.allowed).toBe(false));
    expect(bodies).toEqual([
      expect.objectContaining({
        spec: {
          resourceAttributes: {
            verb: 'patch',
            group: 'apps',
            resource: 'deployments',
            subresource: 'scale',
            namespace: 'shop',
          },
        },
      }),
    ]);
  });
});
