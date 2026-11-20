import {
  ConfigMapModel,
  NamespaceModel,
  PodModel,
  type ConfigMap,
  type K8sList,
  type K8sResource,
  type SelfSubjectAccessReview,
  type Status,
} from '@/shared/k8s';
import { mockDb, mockK8s, setMockUser } from '@/test/handlers';

/** Plain-`fetch` tests of the mock Kubernetes proxy (T-0070, CP2 contract §1–4). */

const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';

function proxyUrl(cluster: string, path: string): string {
  return `${globalThis.location.origin}/api/clusters/${cluster}/k8s${path}`;
}

function get(cluster: string, path: string, signal?: AbortSignal): Promise<Response> {
  return fetch(proxyUrl(cluster, path), signal ? { signal } : {});
}

function send(cluster: string, method: string, path: string, body?: unknown, csrf = true): Promise<Response> {
  return fetch(proxyUrl(cluster, path), {
    method,
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Console-Request': '1' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function listNames(cluster: string, path: string): Promise<string[]> {
  const response = await get(cluster, path);
  expect(response.status).toBe(200);
  const list = await json<K8sList<K8sResource>>(response);
  return list.items.map((item) => item.metadata.name ?? '');
}

async function code(response: Response): Promise<string | undefined> {
  return (await json<{ code?: string }>(response)).code;
}

const SHOP = '/api/v1/namespaces/shop';

describe('mock k8s proxy: guard checks (contract §4 order)', () => {
  it('answers 401 without a session and 403 CSRF on a PUT without the header', async () => {
    const put = await send('dev-1', 'PUT', `${SHOP}/configmaps/web-config`, {}, false);
    expect(put.status).toBe(403);
    expect(await code(put)).toBe('Auth.CsrfHeaderMissing');

    setMockUser(null);
    const anonymous = await get('dev-1', `${SHOP}/pods`);
    expect(anonymous.status).toBe(401);
  });

  it('rejects paths outside the allowlist with 400 before the cluster check', async () => {
    for (const [cluster, path] of [
      ['dev-1', '/healthz'],
      ['dev-1', '/api/v1/namespaces/shop%2Fpods'],
      ['nope', '/metrics'],
    ] as const) {
      const response = await get(cluster, path);
      expect(response.status).toBe(400);
      expect(await code(response)).toBe('Proxy.PathNotAllowed');
    }
  });

  it('answers 404 Proxy.NotAvailable for unknown, ungranted and disabled clusters', async () => {
    for (const [user, cluster] of [
      ['admin', 'nope'],
      ['admin', 'prod-eu-1'],
      ['carol', 'dev-2'],
    ] as const) {
      setMockUser(user);
      const response = await get(cluster, `${SHOP}/pods`);
      expect(response.status).toBe(404);
      const body = await json<{ code: string; detail: string }>(response);
      expect(body).toMatchObject({
        code: 'Proxy.NotAvailable',
        detail: `Cluster ${cluster} is not available — it does not exist or you don't have access.`,
      });
    }
  });

  it('checks the read-only user before the read-only grant, then the credential', async () => {
    setMockUser('ines');
    const userReadOnly = await send('prod-us-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`);
    expect(userReadOnly.status).toBe(403);
    expect(await code(userReadOnly)).toBe('Proxy.UserReadOnly');
    const rejected = await get('prod-us-1', `${SHOP}/pods`);
    expect(rejected.status).toBe(502);
    expect(await code(rejected)).toBe('Proxy.CredentialRejected');

    setMockUser('alice');
    const grantReadOnly = await send('prod-eu-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`);
    expect(grantReadOnly.status).toBe(403);
    expect(await json<{ code: string; detail: string }>(grantReadOnly)).toMatchObject({
      code: 'Proxy.ReadOnlyGrant',
      detail: 'Your access to prod-eu-1 is read-only.',
    });
    // Access reviews are not mutations.
    const review = await send('prod-eu-1', 'POST', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', {
      spec: { resourceAttributes: { verb: 'get', resource: 'pods', namespace: 'shop' } },
    });
    expect(review.status).toBe(201);
  });
});

describe('mock k8s API server: reads', () => {
  it('pages with limit/continue, strips type meta from items and expires compacted tokens', async () => {
    const first = await json<K8sList<K8sResource>>(await get('dev-1', '/api/v1/pods?limit=2'));
    expect(first.kind).toBe('PodList');
    expect(first.items.map((pod) => pod.metadata.name)).toEqual([
      'web-7d4b9c8f6d-2xkqp',
      'web-7d4b9c8f6d-8mzrt',
    ]);
    expect(first.items[0]).not.toHaveProperty('kind');
    expect(first.metadata.remainingItemCount).toBe(1);

    const token = encodeURIComponent(first.metadata.continue ?? '');
    const second = await json<K8sList<K8sResource>>(
      await get('dev-1', `/api/v1/pods?limit=2&continue=${token}`),
    );
    expect(second.items.map((pod) => pod.metadata.name)).toEqual([CRASHING_POD]);
    expect(second.metadata.continue).toBeUndefined();
    expect(second.metadata.resourceVersion).toBe(first.metadata.resourceVersion);

    mockK8s.compact('dev-1');
    const expired = await get('dev-1', `/api/v1/pods?limit=2&continue=${token}`);
    expect(expired.status).toBe(410);
    expect(await json<Status>(expired)).toMatchObject({ kind: 'Status', reason: 'Expired', code: 410 });
  });

  it('filters by label and field selectors', async () => {
    expect(await listNames('dev-1', `${SHOP}/configmaps?labelSelector=app%3Dweb`)).toEqual([
      'web-assets',
      'web-config',
    ]);
    expect(
      await listNames('dev-1', `/api/v1/configmaps?labelSelector=${encodeURIComponent('app in (payments)')}`),
    ).toEqual(['payments-config']);
    expect(
      await listNames('dev-1', `/api/v1/configmaps?labelSelector=${encodeURIComponent('app!=web')}`),
    ).toEqual(['payments-config']);
    expect(await listNames('dev-1', '/api/v1/configmaps?labelSelector=tier')).toEqual(['payments-config']);
    expect(
      await listNames('dev-1', `/api/v1/configmaps?labelSelector=${encodeURIComponent('!tier,app')}`),
    ).toEqual(['web-assets', 'web-config']);
    expect(await listNames('dev-1', `${SHOP}/pods?fieldSelector=metadata.name%3D${CRASHING_POD}`)).toEqual([
      CRASHING_POD,
    ]);

    const uid = mockK8s.get('dev-1', PodModel, 'shop', CRASHING_POD)?.metadata.uid ?? '';
    const events = await listNames('dev-1', `${SHOP}/events?fieldSelector=involvedObject.uid%3D${uid}`);
    expect(events).toHaveLength(2);
  });

  it('returns an empty list for an unknown namespace and 404 NotFound for a missing object', async () => {
    expect(await listNames('dev-1', '/api/v1/namespaces/nope/pods')).toEqual([]);
    const missing = await get('dev-1', `${SHOP}/configmaps/nope`);
    expect(missing.status).toBe(404);
    expect(await json<Status>(missing)).toMatchObject({ kind: 'Status', reason: 'NotFound' });
  });

  it('serves project.openshift.io everywhere except on vanilla lab-1', async () => {
    const groupsOf = async (cluster: string) =>
      (await json<{ groups: { name: string }[] }>(await get(cluster, '/apis'))).groups.map(
        (group) => group.name,
      );
    expect(await groupsOf('dev-1')).toContain('project.openshift.io');

    const credential = { ...structuredClone(mockDb.credentials[0]), id: 'lab', clusterName: 'lab-1' };
    const grant = {
      ...structuredClone(mockDb.grants[0]),
      id: 'lab',
      username: 'admin',
      clusterName: 'lab-1',
    };
    mockDb.credentials.push({ ...credential, name: 'fleet-admin' } as (typeof mockDb.credentials)[number]);
    mockDb.grants.push({ ...grant, credentialId: 'lab' } as (typeof mockDb.grants)[number]);

    const groups = await groupsOf('lab-1');
    expect(groups).toEqual(['apps', 'authorization.k8s.io']);
    expect((await get('lab-1', '/apis/project.openshift.io/v1/projects')).status).toBe(404);
    expect((await json<{ versions: string[] }>(await get('lab-1', '/api'))).versions).toEqual(['v1']);
  });
});

describe('mock k8s API server: writes and RBAC', () => {
  const path = `${SHOP}/configmaps/web-config`;

  it('updates with optimistic concurrency (200 / 409 / 422)', async () => {
    const current = await json<ConfigMap>(await get('dev-1', path));
    const updated = await send('dev-1', 'PUT', path, { ...current, data: { LOG_LEVEL: 'warn' } });
    expect(updated.status).toBe(200);
    const body = await json<ConfigMap>(updated);
    expect(Number(body.metadata?.resourceVersion)).toBeGreaterThan(Number(current.metadata?.resourceVersion));
    expect(body.metadata?.uid).toBe(current.metadata?.uid);
    expect(mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config')).toMatchObject({
      data: { LOG_LEVEL: 'warn' },
    });

    const stale = await send('dev-1', 'PUT', path, current);
    expect(stale.status).toBe(409);
    expect(await json<Status>(stale)).toMatchObject({ reason: 'Conflict', code: 409 });

    const renamed = await send('dev-1', 'PUT', path, {
      ...body,
      metadata: { ...body.metadata, name: 'other' },
    });
    expect(renamed.status).toBe(422);
    expect(await json<Status>(renamed)).toMatchObject({ reason: 'Invalid' });
    const notAString = await send('dev-1', 'PUT', path, { ...body, data: { LOG_LEVEL: 3 } });
    expect(notAString.status).toBe(422);
  });

  it('deletes (200 Status, then 404) and cascades a namespace', async () => {
    const deleted = await send('dev-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`);
    expect(deleted.status).toBe(200);
    expect(await json<Status>(deleted)).toMatchObject({
      kind: 'Status',
      status: 'Success',
      details: { name: CRASHING_POD },
    });
    expect((await send('dev-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`)).status).toBe(404);

    mockK8s.remove('dev-1', NamespaceModel, undefined, 'shop');
    expect(mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config')).toBeUndefined();
    expect((await get('dev-1', '/apis/project.openshift.io/v1/projects/shop')).status).toBe(404);
  });

  it('enforces the credential profile with apiserver-style 403 Status', async () => {
    // admin's dev-1 grant uses fleet-edit: namespaces are read-only.
    const response = await send('dev-1', 'DELETE', '/api/v1/namespaces/shop');
    expect(response.status).toBe(403);
    expect(await json<Status>(response)).toMatchObject({
      reason: 'Forbidden',
      message:
        'namespaces "shop" is forbidden: User "system:serviceaccount:fleetconsole:fleet-edit" cannot delete ' +
        'resource "namespaces" in API group "" at the cluster scope',
    });

    // pending-paul has readWrite through the view-only credential: the proxy lets it through, the cluster denies.
    setMockUser('pending-paul');
    const denied = await send('prod-eu-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`);
    expect(denied.status).toBe(403);
    expect(await json<Status>(denied)).toMatchObject({ kind: 'Status', reason: 'Forbidden' });
  });

  it('answers SelfSubjectAccessReviews from the profile', async () => {
    const can = async (user: string, cluster: string, verb: string, resource: string) => {
      setMockUser(user);
      const response = await send(cluster, 'POST', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: { resourceAttributes: { verb, resource, namespace: 'shop' } },
      });
      return (await json<SelfSubjectAccessReview>(response)).status?.allowed;
    };
    expect(await can('pending-paul', 'prod-eu-1', 'list', 'pods')).toBe(true);
    expect(await can('pending-paul', 'prod-eu-1', 'delete', 'pods')).toBe(false);
    expect(await can('admin', 'dev-1', 'delete', 'pods')).toBe(true);
    expect(await can('admin', 'dev-1', 'delete', 'namespaces')).toBe(false);
    expect(await can('alice', 'staging-eu-1', 'delete', 'namespaces')).toBe(true);
  });
});

describe('mock k8s API server: watch', () => {
  const decoder = new TextDecoder();

  async function readLines(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string[]> {
    const { value, done } = await reader.read();
    if (done) return [];
    return decoder.decode(value).split('\n').filter(Boolean);
  }

  async function listRv(): Promise<string> {
    const list = await json<K8sList<K8sResource>>(await get('dev-1', `${SHOP}/configmaps`));
    return list.metadata.resourceVersion ?? '';
  }

  it('streams a store change as one NDJSON line and closes on abort', async () => {
    const rv = await listRv();
    const abort = new AbortController();
    const response = await get('dev-1', `${SHOP}/configmaps?watch=1&resourceVersion=${rv}`, abort.signal);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();

    const stored = mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config');
    if (!stored) throw new Error('fixture web-config missing');
    mockK8s.upsert('dev-1', { ...stored, data: { LOG_LEVEL: 'trace' } } as K8sResource);
    // Changes outside the watched namespace/kind are not delivered.
    mockK8s.remove('dev-1', PodModel, 'shop', CRASHING_POD);

    const lines = await readLines(reader);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0] ?? '') as { type: string; object: ConfigMap };
    expect(event.type).toBe('MODIFIED');
    expect(event.object).toMatchObject({ kind: 'ConfigMap', data: { LOG_LEVEL: 'trace' } });

    abort.abort();
    await expect(reader.read()).rejects.toThrow();
  });

  it('streams an ERROR 410 event for a compacted resourceVersion', async () => {
    const rv = await listRv();
    mockK8s.compact('dev-1');
    const response = await get('dev-1', `${SHOP}/configmaps?watch=true&resourceVersion=${rv}`);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const lines = await readLines(reader);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      type: 'ERROR',
      object: { kind: 'Status', code: 410, reason: 'Expired' },
    });
    expect((await reader.read()).done).toBe(true);
  });
});

describe('mock k8s proxy: audit (PAUD-4, CP2 contract §5)', () => {
  it('audits forwarded and denied mutations, never reads or access reviews', async () => {
    const before = mockDb.audit.length;
    expect((await get('dev-1', `${SHOP}/pods`)).status).toBe(200);
    const review = await send('dev-1', 'POST', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', {});
    expect(review.status).toBe(400); // no `spec`: a 400, not a crash
    expect(mockDb.audit).toHaveLength(before);

    expect((await send('dev-1', 'DELETE', `${SHOP}/pods/${CRASHING_POD}`)).status).toBe(200);
    expect(mockDb.audit[0]).toMatchObject({
      actor: 'admin',
      action: 'proxy.delete',
      category: 'proxy',
      targetType: 'kubernetesResource',
      targetName: `shop/pods/${CRASHING_POD}`,
      clusterName: 'dev-1',
      summary: `admin deleted shop/pods/${CRASHING_POD} on dev-1 (200)`,
      details: { method: 'DELETE', resource: 'pods', namespace: 'shop', statusCode: 200, outcome: 'allowed' },
    });

    setMockUser('alice');
    expect((await send('prod-eu-1', 'PUT', `${SHOP}/configmaps/web-config`, {})).status).toBe(403);
    expect(mockDb.audit[0]).toMatchObject({
      actor: 'alice',
      action: 'proxy.update',
      targetName: 'shop/configmaps/web-config',
      summary: 'Denied: alice tried to update shop/configmaps/web-config on prod-eu-1 (read-only grant)',
      details: { statusCode: 403, outcome: 'denied', reason: 'readOnlyGrant' },
    });
    expect(mockDb.audit).toHaveLength(before + 2);
  });
});
