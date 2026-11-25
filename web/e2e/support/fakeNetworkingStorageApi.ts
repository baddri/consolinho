import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import jsonPatch, { type Operation } from 'fast-json-patch';
import { selfSignedCertificate } from './fakeKubeApi';
// Same token scheme and record shape as the CP4 fake, so specs share `fakeServiceAccountToken(EDITOR_SA | VIEWER_SA)`.
import { EDITOR_SA, type K8sObject, type RecordedRequest } from './fakeWorkloadsApi';

/** The namespace the CP5a spec browses, as the MSW fixtures (`web/src/mocks/k8s/networkingStorageFixtures.ts`). */
export const SHOP_NAMESPACE = 'shop';
/** The expandable, Bound claim (10Gi on the default `standard-csi` class) the RW user grows to 20Gi. */
export const EXPANDABLE_PVC = 'db-data';
export const EXPANDABLE_STORAGE_CLASS = 'standard-csi';
/** The edge-terminated, admitted Route whose Location is an `https://` link. */
export const SECURED_ROUTE = 'web';
export const SECURED_ROUTE_HOST = 'web-shop.apps.e2e.example.com';
/** Admitted Routes whose Location must stay text: a wildcard host and a `javascript:` "host". */
export const WILDCARD_ROUTE = 'wildcard';
export const WILDCARD_ROUTE_HOST = '*.wild.apps.e2e.example.com';
export const UNSAFE_ROUTE = 'unsafe';
export const UNSAFE_ROUTE_HOST = 'javascript:alert(1)';

/** A running stateful fake API server for the CP5a networking/storage/projects spec. */
export interface FakeNetworkingStorageApi {
  url: string;
  /** Every request so far (cleared by {@link reset}). */
  requests: RecordedRequest[];
  /** Requests the fake did not know (404), to spot gaps when the UI grows. */
  unknown: string[];
  /** Restores the seeded objects and forgets recorded requests. */
  reset: () => void;
  /** The stored object `name` of `plural` (live), `undefined` when absent; `namespace` omitted for cluster scope. */
  object: (plural: string, name: string, namespace?: string) => K8sObject | undefined;
  close: () => Promise<void>;
}

/** A stored object with the URL prefix and plural that address it. */
interface Entry {
  prefix: string;
  plural: string;
  object: K8sObject;
}

/** An open watch: which collection it follows and its response stream. */
interface Watcher {
  prefix: string;
  plural: string;
  namespace: string | undefined;
  response: ServerResponse;
}

/** `/api/v1|/apis/<g>/<v>` `[/namespaces/<ns>]` `/<plural>[/<name>[/<subresource>]]`. */
const RESOURCE_PATH =
  /^(\/api\/v1|\/apis\/[^/]+\/[^/]+)(?:\/namespaces\/([^/]+))?\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

/** Collections served even when empty (an unknown plural is a 404, which the UI shows as an error). */
const COMMON_COLLECTIONS: Record<string, string> = {
  '/api/v1 namespaces': 'Namespace',
  '/api/v1 pods': 'Pod',
  '/api/v1 services': 'Service',
  '/api/v1 events': 'Event',
  '/api/v1 persistentvolumes': 'PersistentVolume',
  '/api/v1 persistentvolumeclaims': 'PersistentVolumeClaim',
  '/apis/storage.k8s.io/v1 storageclasses': 'StorageClass',
  '/apis/networking.k8s.io/v1 ingresses': 'Ingress',
  '/apis/networking.k8s.io/v1 networkpolicies': 'NetworkPolicy',
};
const OPENSHIFT_COLLECTIONS: Record<string, string> = {
  '/apis/route.openshift.io/v1 routes': 'Route',
  '/apis/project.openshift.io/v1 projects': 'Project',
};
const COMMON_GROUPS = ['apps/v1', 'batch/v1', 'storage.k8s.io/v1', 'networking.k8s.io/v1'];
const OPENSHIFT_GROUPS = ['route.openshift.io/v1', 'project.openshift.io/v1'];

/**
 * Starts a stateful Kubernetes API stand-in for the CP5a e2e (QG5A-2, T-0311) behind the real FleetConsole proxy.
 * `openShift` decides discovery: with it the fake serves `route.openshift.io` (Routes in `shop`) and
 * `project.openshift.io` (Projects, `POST projectrequests` creating a Project and its Namespace); without it, a vanilla
 * Kubernetes cluster (the spec's `prod-k8s-1`). It serves lists, gets and idle watches that announce every write
 * (MODIFIED/ADDED), and JSON Patch on objects; a grown PVC request is mirrored into `status.capacity` at once (as the
 * MSW `settlePvcResize`). RBAC is by token as in `fakeWorkloadsApi.ts`: the editor SA may do anything, every other
 * token only reads (SSAR denied, writes 403). Every request is recorded with its bearer token (SAFE5-3 evidence).
 */
export async function startFakeNetworkingStorageApi({
  openShift,
}: {
  openShift: boolean;
}): Promise<FakeNetworkingStorageApi> {
  const certificate = selfSignedCertificate();
  const collections = { ...COMMON_COLLECTIONS, ...(openShift ? OPENSHIFT_COLLECTIONS : {}) };
  const groups = [...COMMON_GROUPS, ...(openShift ? OPENSHIFT_GROUPS : [])];
  let entries: Entry[] = [];
  let revision = 100;
  const watchers = new Set<Watcher>();
  const requests: RecordedRequest[] = [];
  const unknown: string[] = [];

  const reset = () => {
    entries = seed(openShift);
    requests.length = 0;
    unknown.length = 0;
  };
  reset();

  const find = (prefix: string, plural: string, namespace: string | undefined, name: string) =>
    entries.find(
      (e) =>
        e.prefix === prefix &&
        e.plural === plural &&
        e.object.metadata.namespace === namespace &&
        e.object.metadata.name === name,
    );

  const announce = (type: 'ADDED' | 'MODIFIED', entry: Entry) => {
    for (const watcher of watchers) {
      if (
        watcher.prefix === entry.prefix &&
        watcher.plural === entry.plural &&
        (watcher.namespace === undefined || watcher.namespace === entry.object.metadata.namespace)
      ) {
        watcher.response.write(`${JSON.stringify({ type, object: entry.object })}\n`);
      }
    }
  };

  const add = (entry: Entry) => {
    revision += 1;
    entry.object.metadata.resourceVersion = String(revision);
    entries.push(entry);
    announce('ADDED', entry);
  };

  const server = createServer({ key: certificate.key, cert: certificate.cert }, (request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) json(response, 500, status(500, 'InternalError', String(error)));
      else response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'https://fake');
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    const serviceAccount = serviceAccountOf(token);
    const method = request.method ?? 'GET';
    const rawBody = method === 'GET' ? '' : await readBody(request);
    const record: RecordedRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      serviceAccount,
      token,
      contentType: request.headers['content-type'],
      body: rawBody ? (JSON.parse(rawBody) as unknown) : undefined,
    };
    requests.push(record);
    const editor = serviceAccount === EDITOR_SA;

    if (method === 'POST' && url.pathname.endsWith('/selfsubjectaccessreviews')) {
      json(response, 201, {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: (record.body as { spec?: unknown } | undefined)?.spec,
        status: { allowed: editor },
      });
      return;
    }
    if (method === 'GET' && url.pathname === '/api') {
      json(response, 200, { kind: 'APIVersions', versions: ['v1'] });
      return;
    }
    if (method === 'GET' && url.pathname === '/apis') {
      json(response, 200, {
        kind: 'APIGroupList',
        apiVersion: 'v1',
        groups: groups.map((groupVersion) => {
          const version = { groupVersion, version: groupVersion.split('/')[1] };
          return { name: groupVersion.split('/')[0], versions: [version], preferredVersion: version };
        }),
      });
      return;
    }
    const match = RESOURCE_PATH.exec(url.pathname);
    if (!match) {
      notFound(response, `${method} ${url.pathname}`);
      return;
    }
    const [, prefix = '', namespace, plural = '', name, subresource] = match;
    if (method !== 'GET' && !editor) {
      json(response, 403, status(403, 'Forbidden', `${plural} is forbidden: User "${String(serviceAccount)}" cannot ${method.toLowerCase()}`));
      return;
    }
    if (openShift && method === 'POST' && prefix === '/apis/project.openshift.io/v1' && plural === 'projectrequests') {
      createProject(response, record.body as K8sObject & { displayName?: string; description?: string });
      return;
    }
    const kind = collections[`${prefix} ${plural}`];
    if (kind === undefined) {
      notFound(response, `${method} ${url.pathname}`);
      return;
    }
    if (name === undefined) {
      if (method !== 'GET') {
        json(response, 405, status(405, 'MethodNotAllowed', 'fake API: collections are read-only'));
        return;
      }
      if (isWatch(url)) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
        response.flushHeaders();
        const watcher: Watcher = { prefix, plural, namespace, response };
        watchers.add(watcher);
        request.on('close', () => watchers.delete(watcher));
        return;
      }
      const fieldName = /metadata\.name=([^,]+)/.exec(url.searchParams.get('fieldSelector') ?? '')?.[1];
      const items = entries
        .filter((e) => e.prefix === prefix && e.plural === plural)
        .map((e) => e.object)
        .filter((o) => namespace === undefined || o.metadata.namespace === namespace)
        .filter((o) => fieldName === undefined || o.metadata.name === fieldName);
      json(response, 200, {
        apiVersion: prefix.replace(/^\/apis?\//, ''),
        kind: `${kind}List`,
        metadata: { resourceVersion: String(revision) },
        items,
      });
      return;
    }
    const entry = find(prefix, plural, namespace, name);
    if (!entry || subresource !== undefined) {
      notFound(response, `${method} ${url.pathname}`);
      return;
    }
    if (method === 'GET') {
      json(response, 200, entry.object);
      return;
    }
    if (method === 'PATCH') {
      if (record.contentType?.split(';')[0]?.trim() !== 'application/json-patch+json') {
        json(response, 415, status(415, 'UnsupportedMediaType', 'fake API: JSON Patch only'));
        return;
      }
      let patched: K8sObject;
      try {
        patched = jsonPatch.applyPatch(structuredClone(entry.object), record.body as Operation[], true).newDocument;
      } catch (error) {
        json(response, 422, status(422, 'Invalid', String(error).split('\n')[0] ?? 'invalid patch'));
        return;
      }
      revision += 1;
      patched.metadata.resourceVersion = String(revision);
      entry.object = settlePvcResize(patched);
      announce('MODIFIED', entry);
      json(response, 200, entry.object);
      return;
    }
    json(response, 405, status(405, 'MethodNotAllowed', `fake API: ${method} is not served`));
  }

  /** `POST projectrequests` as OpenShift: 409 for a taken name, else a new Project + Namespace (ADDED to watchers). */
  function createProject(
    response: ServerResponse,
    body: K8sObject & { displayName?: string; description?: string },
  ): void {
    const projectName = body.metadata.name;
    if (find('/api/v1', 'namespaces', undefined, projectName)) {
      json(response, 409, status(409, 'AlreadyExists', `project.project.openshift.io "${projectName}" already exists`));
      return;
    }
    const annotations: Record<string, string> = {};
    if (body.displayName) annotations['openshift.io/display-name'] = body.displayName;
    if (body.description) annotations['openshift.io/description'] = body.description;
    const created = metadata(projectName, undefined, annotations);
    created.creationTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    add({ prefix: '/api/v1', plural: 'namespaces', object: namespaceObject(created) });
    const project: Entry = { prefix: '/apis/project.openshift.io/v1', plural: 'projects', object: projectObject(structuredClone(created)) };
    add(project);
    json(response, 201, project.object);
  }

  function notFound(response: ServerResponse, what: string): void {
    unknown.push(what);
    json(response, 404, status(404, 'NotFound', `fake API: ${what} not found`));
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}`,
    requests,
    unknown,
    reset,
    object: (plural, name, namespace) =>
      entries.find(
        (e) => e.plural === plural && e.object.metadata.name === name && e.object.metadata.namespace === namespace,
      )?.object,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        certificate.dispose();
      }),
  };
}

let uidCounter = 0;

function metadata(
  name: string,
  namespace: string | undefined,
  annotations?: Record<string, string>,
): K8sObject['metadata'] {
  uidCounter += 1;
  return {
    name,
    ...(namespace === undefined ? {} : { namespace }),
    uid: `00000000-0000-4000-8000-${String(uidCounter).padStart(12, '0')}`,
    resourceVersion: '100',
    creationTimestamp: '2026-01-01T00:00:00Z',
    ...(annotations && Object.keys(annotations).length > 0 ? { annotations } : {}),
  };
}

function namespaceObject(meta: K8sObject['metadata']): K8sObject {
  return { apiVersion: 'v1', kind: 'Namespace', metadata: meta, status: { phase: 'Active' } };
}

function projectObject(meta: K8sObject['metadata']): K8sObject {
  return { apiVersion: 'project.openshift.io/v1', kind: 'Project', metadata: meta, status: { phase: 'Active' } };
}

/** Admission by the default router: `Admitted` True. */
function admitted(host: string): Record<string, unknown> {
  return {
    ingress: [
      {
        host,
        routerName: 'default',
        routerCanonicalHostname: 'router-default.apps.e2e.example.com',
        wildcardPolicy: 'None',
        conditions: [{ type: 'Admitted', status: 'True', lastTransitionTime: '2026-01-01T00:00:00Z' }],
      },
    ],
  };
}

/** The seeded objects: StorageClass, PV + Bound PVC `db-data` in `shop`, its namespace (+ Project and Routes on OpenShift). */
function seed(openShift: boolean): Entry[] {
  const core = (plural: string, object: K8sObject): Entry => ({ prefix: '/api/v1', plural, object });
  const route = (name: string, spec: Record<string, unknown>): Entry => ({
    prefix: '/apis/route.openshift.io/v1',
    plural: 'routes',
    object: {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { ...metadata(name, SHOP_NAMESPACE), labels: { app: 'web' } },
      spec: { wildcardPolicy: 'None', to: { kind: 'Service', name: 'web', weight: 100 }, ...spec },
      status: admitted(String(spec.host)),
    },
  });
  const entries: Entry[] = [
    core('namespaces', namespaceObject(metadata(SHOP_NAMESPACE, undefined))),
    {
      prefix: '/apis/storage.k8s.io/v1',
      plural: 'storageclasses',
      object: {
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: metadata(EXPANDABLE_STORAGE_CLASS, undefined, {
          'storageclass.kubernetes.io/is-default-class': 'true',
        }),
        provisioner: 'ebs.csi.aws.com',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'WaitForFirstConsumer',
        allowVolumeExpansion: true,
      } as K8sObject,
    },
    core('persistentvolumes', {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: metadata('pv-db-data', undefined),
      spec: {
        capacity: { storage: '10Gi' },
        accessModes: ['ReadWriteOnce'],
        persistentVolumeReclaimPolicy: 'Delete',
        storageClassName: EXPANDABLE_STORAGE_CLASS,
        volumeMode: 'Filesystem',
        claimRef: { kind: 'PersistentVolumeClaim', namespace: SHOP_NAMESPACE, name: EXPANDABLE_PVC, apiVersion: 'v1' },
        csi: { driver: 'ebs.csi.aws.com', volumeHandle: 'vol-0a1b2c3d', fsType: 'xfs' },
      },
      status: { phase: 'Bound' },
    }),
    core('persistentvolumeclaims', {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: metadata(EXPANDABLE_PVC, SHOP_NAMESPACE),
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '10Gi' } },
        storageClassName: EXPANDABLE_STORAGE_CLASS,
        volumeMode: 'Filesystem',
        volumeName: 'pv-db-data',
      },
      status: { phase: 'Bound', accessModes: ['ReadWriteOnce'], capacity: { storage: '10Gi' } },
    }),
  ];
  if (!openShift) return entries;
  return [
    ...entries,
    {
      prefix: '/apis/project.openshift.io/v1',
      plural: 'projects',
      object: projectObject(metadata(SHOP_NAMESPACE, undefined)),
    },
    route(SECURED_ROUTE, {
      host: SECURED_ROUTE_HOST,
      port: { targetPort: 'http' },
      // Edge termination without certificate/key: the e2e never needs (or should hold) key material.
      tls: { termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' },
    }),
    route(WILDCARD_ROUTE, { host: WILDCARD_ROUTE_HOST, wildcardPolicy: 'Subdomain' }),
    route(UNSAFE_ROUTE, { host: UNSAFE_ROUTE_HOST }),
  ];
}

/** A grown, Bound claim's request mirrored into `status.capacity` (online CSI expansion; MSW `settlePvcResize`). */
function settlePvcResize(object: K8sObject): K8sObject {
  if (object.kind !== 'PersistentVolumeClaim' || object.status?.phase !== 'Bound') return object;
  const requested = (object.spec?.resources as { requests?: { storage?: string } } | undefined)?.requests?.storage;
  const capacity = (object.status.capacity as { storage?: string } | undefined)?.storage;
  if (requested === undefined || (capacity !== undefined && !(gibibytes(requested) > gibibytes(capacity)))) {
    return object;
  }
  object.status = { ...object.status, capacity: { storage: requested } };
  return object;
}

/** `Mi`/`Gi`/`Ti` quantities in GiB (all the e2e writes); anything else is NaN, so nothing settles. */
function gibibytes(quantity: string): number {
  const match = /^(\d+(?:\.\d+)?)(Mi|Gi|Ti)$/.exec(quantity);
  if (!match) return Number.NaN;
  const factor = { Mi: 1 / 1024, Gi: 1, Ti: 1024 }[match[2] as 'Mi' | 'Gi' | 'Ti'];
  return Number(match[1]) * factor;
}

function serviceAccountOf(token: string | undefined): string | undefined {
  const payload = token?.split('.')[1];
  if (!payload) return undefined;
  try {
    const { sub } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
    return sub?.split(':').at(-1);
  } catch {
    return undefined;
  }
}

function isWatch(url: URL): boolean {
  const watch = url.searchParams.get('watch');
  return watch === 'true' || watch === '1';
}

function json(response: ServerResponse, code: number, body: unknown): void {
  response.writeHead(code, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function status(code: number, reason: string, message: string) {
  return { apiVersion: 'v1', kind: 'Status', metadata: {}, status: 'Failure', reason, code, message };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
