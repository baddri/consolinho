import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import jsonPatch, { type Operation } from 'fast-json-patch';
import { selfSignedCertificate } from './fakeKubeApi';
// Same token scheme and record shape as the CP4 fake, so specs share `fakeServiceAccountToken(EDITOR_SA | VIEWER_SA)`.
import { EDITOR_SA, type K8sObject, type RecordedRequest } from './fakeWorkloadsApi';

/** The schedulable worker the RW user cordons and uncordons; the pods below run on it. */
export const WORKER_NODE = 'e2e-worker-1';
export const CONTROL_PLANE_NODE = 'e2e-master-0';
/** Pods on {@link WORKER_NODE}: one per owner shape the drain view distinguishes (NODE-4). */
export const DAEMONSET_POD = 'dns-default-x7k2p';
export const REPLICASET_POD = 'web-6d4f8b7c9-abcde';
export const BARE_POD = 'debug-shell';
/** A pod elsewhere, which must not show on the worker's Pods tab. */
export const OTHER_NODE_POD = 'etcd-e2e-master-0';
/** Image names in the worker's `status.images` (node Images section, T-0369). */
export const NODE_IMAGE = 'quay.io/e2e/dns:v4.18';
/** OLM: the operator namespace, its CSV (copied into `shop` by OLM) and its Subscription. */
export const OPERATOR_NAMESPACE = 'e2e-operators';
export const COPY_NAMESPACE = 'shop';
export const CSV_NAME = 'etcd-operator.v0.9.4';
export const CSV_DISPLAY_NAME = 'etcd';
export const SUBSCRIPTION_CHANNEL = 'singlenamespace-alpha';
export const CATALOG_SOURCE = 'community-operators';
/** A CSV no Subscription installed (OLM-4 empty state). */
export const ORPHAN_CSV_NAME = 'orphan-operator.v1.0.0';
export const ORPHAN_CSV_DISPLAY_NAME = 'Orphan Operator';
/** ClusterVersion facts the Details and Status cards show. */
export const OPENSHIFT_VERSION = '4.18.12';
export const UPDATE_CHANNEL = 'stable-4.18';
export const CLUSTER_ID = '0b8c6c2e-e2e0-4f0e-9a7c-000000000e2e';
export const KUBERNETES_VERSION = 'v1.31.4';
export const API_SERVER_URL = 'https://api.e2e.example.com:6443';
export const EVENT_MESSAGE = 'Started container web';

/** A running stateful fake API server for the CP5b compute/overview/operators spec. */
export interface FakeComputeApi {
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

/** A stored object; events and StorageClasses carry top-level fields beyond `spec`/`status`. */
type StoredObject = K8sObject & Record<string, unknown>;

interface Entry {
  prefix: string;
  plural: string;
  object: StoredObject;
}

interface Watcher {
  prefix: string;
  plural: string;
  namespace: string | undefined;
  response: ServerResponse;
}

const RESOURCE_PATH =
  /^(\/api\/v1|\/apis\/[^/]+\/[^/]+)(?:\/namespaces\/([^/]+))?\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

const CORE = '/api/v1';
const APPS = '/apis/apps/v1';
const CONFIG = '/apis/config.openshift.io/v1';
const MACHINE = '/apis/machine.openshift.io/v1beta1';
const OLM = '/apis/operators.coreos.com/v1alpha1';

/** Collections served even when empty (an unknown plural is a 404, which the UI shows as an error). */
const COMMON_COLLECTIONS: Record<string, string> = {
  [`${CORE} namespaces`]: 'Namespace',
  [`${CORE} nodes`]: 'Node',
  [`${CORE} pods`]: 'Pod',
  [`${CORE} services`]: 'Service',
  [`${CORE} events`]: 'Event',
  [`${CORE} persistentvolumes`]: 'PersistentVolume',
  [`${CORE} persistentvolumeclaims`]: 'PersistentVolumeClaim',
  [`${APPS} deployments`]: 'Deployment',
  [`${APPS} daemonsets`]: 'DaemonSet',
  [`${APPS} replicasets`]: 'ReplicaSet',
  [`${APPS} statefulsets`]: 'StatefulSet',
  '/apis/storage.k8s.io/v1 storageclasses': 'StorageClass',
};
const OPENSHIFT_COLLECTIONS: Record<string, string> = {
  [`${CONFIG} clusterversions`]: 'ClusterVersion',
  [`${CONFIG} clusteroperators`]: 'ClusterOperator',
  [`${CONFIG} infrastructures`]: 'Infrastructure',
  [`${MACHINE} machines`]: 'Machine',
  [`${MACHINE} machinesets`]: 'MachineSet',
  [`${OLM} clusterserviceversions`]: 'ClusterServiceVersion',
  [`${OLM} subscriptions`]: 'Subscription',
  [`${OLM} installplans`]: 'InstallPlan',
  '/apis/project.openshift.io/v1 projects': 'Project',
};
const COMMON_GROUPS = ['apps/v1', 'storage.k8s.io/v1'];
const OPENSHIFT_GROUPS = [
  'config.openshift.io/v1',
  'machine.openshift.io/v1beta1',
  'operators.coreos.com/v1alpha1',
  'project.openshift.io/v1',
];

/**
 * Starts a stateful Kubernetes API stand-in for the CP5b e2e (QG5B-2, T-0339) behind the real FleetConsole proxy.
 * `openShift` decides discovery: with it the fake serves ClusterVersion/ClusterOperators/Infrastructure, the Machine
 * API and OLM (CSVs, one copied into `shop` with `olm.copiedFrom`, and a Subscription); without it a vanilla
 * Kubernetes cluster (the spec's `prod-k8s-1`) with Nodes, pods and events only. Lists honour `fieldSelector`
 * (`a=b`, `a!=b` on dotted paths, e.g. `spec.nodeName`, `status.phase`) and `labelSelector` (`k`, `!k`, `k=v`) server
 * side, as the UI relies on both (NODE-4 drain view, OLM-1 copied CSVs). Watches stay idle and announce JSON Patch
 * writes. RBAC by token as `fakeWorkloadsApi.ts`: the editor SA may do anything, every other token only reads.
 */
export async function startFakeComputeApi({ openShift }: { openShift: boolean }): Promise<FakeComputeApi> {
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
    if (method === 'GET' && url.pathname === '/version') {
      json(response, 200, {
        major: '1',
        minor: '31',
        gitVersion: KUBERNETES_VERSION,
        platform: 'linux/amd64',
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
      json(
        response,
        403,
        status(
          403,
          'Forbidden',
          `${plural} is forbidden: User "${String(serviceAccount)}" cannot ${method.toLowerCase()}`,
        ),
      );
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
      const fields = parseFieldSelector(url.searchParams.get('fieldSelector'));
      const labels = parseLabelSelector(url.searchParams.get('labelSelector'));
      const items = entries
        .filter((e) => e.prefix === prefix && e.plural === plural)
        .map((e) => e.object)
        .filter((o) => namespace === undefined || o.metadata.namespace === namespace)
        .filter((o) => fields.every((test) => test(o)))
        .filter((o) => labels.every((test) => test(o)));
      json(response, 200, {
        apiVersion: prefix.replace(/^\/apis?\//, ''),
        kind: `${kind}List`,
        metadata: { resourceVersion: String(revision) },
        items,
      });
      return;
    }
    const entry = entries.find(
      (e) =>
        e.prefix === prefix &&
        e.plural === plural &&
        e.object.metadata.namespace === namespace &&
        e.object.metadata.name === name,
    );
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
      let patched: StoredObject;
      try {
        patched = jsonPatch.applyPatch(
          structuredClone(entry.object),
          record.body as Operation[],
          true,
        ).newDocument;
      } catch (error) {
        json(response, 422, status(422, 'Invalid', String(error).split('\n')[0] ?? 'invalid patch'));
        return;
      }
      revision += 1;
      patched.metadata.resourceVersion = String(revision);
      entry.object = patched;
      for (const watcher of watchers) {
        if (
          watcher.prefix === entry.prefix &&
          watcher.plural === entry.plural &&
          (watcher.namespace === undefined || watcher.namespace === entry.object.metadata.namespace)
        ) {
          watcher.response.write(`${JSON.stringify({ type: 'MODIFIED', object: entry.object })}\n`);
        }
      }
      json(response, 200, entry.object);
      return;
    }
    json(response, 405, status(405, 'MethodNotAllowed', `fake API: ${method} is not served`));
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
        (e) =>
          e.plural === plural && e.object.metadata.name === name && e.object.metadata.namespace === namespace,
      )?.object,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        certificate.dispose();
      }),
  };
}

type Predicate = (object: K8sObject) => boolean;

/** The value at a dotted path (`spec.nodeName`), as a string, `''` when absent (as the apiserver compares). */
function valueAt(object: K8sObject, path: string): string {
  let value: unknown = object;
  for (const key of path.split('.')) {
    value = value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  }
  return typeof value === 'string' ? value : '';
}

function parseFieldSelector(selector: string | null): Predicate[] {
  if (!selector) return [];
  return selector.split(',').map((term) => {
    const negated = term.includes('!=');
    const [path = '', expected = ''] = term.split(negated ? '!=' : /==?/);
    return (object) => (valueAt(object, path) === expected) !== negated;
  });
}

function parseLabelSelector(selector: string | null): Predicate[] {
  if (!selector) return [];
  return selector.split(',').map((term) => {
    const labels = (object: K8sObject) => object.metadata.labels ?? {};
    if (term.startsWith('!')) return (object) => !(term.slice(1) in labels(object));
    const [key = '', value] = term.split('=');
    return (object) => (value === undefined ? key in labels(object) : labels(object)[key] === value);
  });
}

let uidCounter = 0;

function metadata(
  name: string,
  namespace: string | undefined,
  extra: Partial<K8sObject['metadata']> = {},
): K8sObject['metadata'] {
  uidCounter += 1;
  return {
    name,
    ...(namespace === undefined ? {} : { namespace }),
    uid: `00000000-0000-4000-8000-${String(uidCounter).padStart(12, '0')}`,
    resourceVersion: '100',
    creationTimestamp: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

const NOW = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function node(name: string, role: 'master' | 'worker', openShift: boolean): Entry {
  const labels: Record<string, string> = {
    'kubernetes.io/hostname': name,
    'kubernetes.io/os': 'linux',
    [`node-role.kubernetes.io/${role}`]: '',
  };
  const ready = {
    type: 'Ready',
    status: 'True',
    reason: 'KubeletReady',
    message: 'kubelet is posting ready status',
    lastHeartbeatTime: NOW(),
    lastTransitionTime: '2026-01-01T00:05:00Z',
  };
  const pressure = (type: string) => ({
    type,
    status: 'False',
    reason: `KubeletHasNo${type}`,
    message: `kubelet has no ${type}`,
    lastHeartbeatTime: NOW(),
    lastTransitionTime: '2026-01-01T00:05:00Z',
  });
  return {
    prefix: CORE,
    plural: 'nodes',
    object: {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: metadata(name, undefined, {
        labels,
        ...(openShift
          ? { annotations: { 'machine.openshift.io/machine': `openshift-machine-api/${name}` } }
          : {}),
      }),
      spec: { providerID: `aws:///us-east-1a/i-0e2e${name.length}` },
      status: {
        conditions: [pressure('MemoryPressure'), pressure('DiskPressure'), pressure('PIDPressure'), ready],
        addresses: [
          { type: 'InternalIP', address: role === 'master' ? '10.0.0.10' : '10.0.0.21' },
          { type: 'Hostname', address: name },
        ],
        capacity: { cpu: '4', memory: '16393684Ki', 'ephemeral-storage': '125293548Ki', pods: '250' },
        allocatable: { cpu: '3500m', memory: '15242708Ki', 'ephemeral-storage': '114396791822', pods: '250' },
        nodeInfo: {
          kubeletVersion: KUBERNETES_VERSION,
          kubeProxyVersion: KUBERNETES_VERSION,
          osImage: 'Red Hat Enterprise Linux CoreOS 418.94',
          operatingSystem: 'linux',
          architecture: 'amd64',
          kernelVersion: '5.14.0-427.el9.x86_64',
          containerRuntimeVersion: 'cri-o://1.31.4',
          machineID: 'e2e',
          systemUUID: 'e2e',
          bootID: 'e2e',
        },
        images: [
          {
            names: [`${NODE_IMAGE.split(':')[0]}@sha256:${'a'.repeat(64)}`, NODE_IMAGE],
            sizeBytes: 524288000,
          },
          { names: ['quay.io/e2e/web:1.0'], sizeBytes: 104857600 },
        ],
      },
    },
  };
}

function pod(
  name: string,
  namespace: string,
  nodeName: string,
  owner?: { apiVersion: string; kind: string; name: string },
): Entry {
  return {
    prefix: CORE,
    plural: 'pods',
    object: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: metadata(name, namespace, {
        ...(owner
          ? { ownerReferences: [{ ...owner, uid: '00000000-0000-4000-8000-0000000000ff', controller: true }] }
          : {}),
      }),
      spec: { nodeName, containers: [{ name: 'main', image: 'quay.io/e2e/web:1.0' }] },
      status: {
        phase: 'Running',
        startTime: '2026-01-01T00:10:00Z',
        conditions: [{ type: 'Ready', status: 'True' }],
        containerStatuses: [
          {
            name: 'main',
            ready: true,
            started: true,
            restartCount: 0,
            image: 'quay.io/e2e/web:1.0',
            imageID: '',
            state: { running: { startedAt: '2026-01-01T00:10:00Z' } },
          },
        ],
      },
    },
  };
}

function namespace(name: string): Entry {
  return {
    prefix: CORE,
    plural: 'namespaces',
    object: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: metadata(name, undefined),
      status: { phase: 'Active' },
    },
  };
}

function condition(type: string, statusValue: 'True' | 'False', message = '') {
  return {
    type,
    status: statusValue,
    lastTransitionTime: '2026-01-01T00:30:00Z',
    ...(message ? { message } : {}),
  };
}

function clusterOperator(name: string): Entry {
  return {
    prefix: CONFIG,
    plural: 'clusteroperators',
    object: {
      apiVersion: 'config.openshift.io/v1',
      kind: 'ClusterOperator',
      metadata: metadata(name, undefined),
      status: {
        conditions: [
          condition('Available', 'True'),
          condition('Progressing', 'False'),
          condition('Degraded', 'False'),
        ],
        versions: [{ name: 'operator', version: OPENSHIFT_VERSION }],
      },
    },
  };
}

function csv(name: string, ns: string, displayName: string, copiedFrom?: string): Entry {
  return {
    prefix: OLM,
    plural: 'clusterserviceversions',
    object: {
      apiVersion: 'operators.coreos.com/v1alpha1',
      kind: 'ClusterServiceVersion',
      metadata: metadata(name, ns, {
        ...(copiedFrom ? { labels: { 'olm.copiedFrom': copiedFrom } } : {}),
        annotations: { 'olm.targetNamespaces': '' },
      }),
      spec: {
        displayName,
        version: name.split('.v')[1] ?? '1.0.0',
        provider: { name: 'E2E Provider' },
        // Raw HTML must not render (OLM-3): the <img onerror> and <script> stay inert text or are dropped.
        description:
          '## About\n\nManages **etcd** clusters. See [docs](https://etcd.io/docs).\n\n<img src="x" onerror="window.e2eXss=1"><script>window.e2eXss=1</script>',
        icon: [
          {
            base64data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
            mediatype: 'image/svg+xml',
          },
        ],
        links: [{ name: 'Homepage', url: 'https://etcd.io' }],
        maintainers: [{ name: 'E2E Maintainer', email: 'maintainer@example.com' }],
        customresourcedefinitions: {
          owned: [
            {
              name: 'etcdclusters.etcd.database.coreos.com',
              version: 'v1beta2',
              kind: 'EtcdCluster',
              displayName: 'etcd Cluster',
            },
          ],
        },
        installModes: [{ type: 'AllNamespaces', supported: true }],
      },
      status: {
        phase: 'Succeeded',
        reason: copiedFrom ? 'Copied' : 'InstallSucceeded',
        message: copiedFrom
          ? 'The operator is running in e2e-operators but is managing this namespace'
          : 'install strategy completed with no errors',
        lastUpdateTime: '2026-01-01T01:00:00Z',
        conditions: [
          {
            phase: 'Succeeded',
            reason: 'InstallSucceeded',
            message: 'install strategy completed with no errors',
            lastTransitionTime: '2026-01-01T01:00:00Z',
          },
        ],
      },
    },
  };
}

/** The seeded objects (see the exported names above). */
function seed(openShift: boolean): Entry[] {
  const entries: Entry[] = [
    namespace('default'),
    namespace('shop'),
    namespace('openshift-dns'),
    namespace('openshift-etcd'),
    node(CONTROL_PLANE_NODE, 'master', openShift),
    node(WORKER_NODE, 'worker', openShift),
    pod(DAEMONSET_POD, 'openshift-dns', WORKER_NODE, {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      name: 'dns-default',
    }),
    pod(REPLICASET_POD, 'shop', WORKER_NODE, {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      name: 'web-6d4f8b7c9',
    }),
    pod(BARE_POD, 'shop', WORKER_NODE),
    pod(OTHER_NODE_POD, 'openshift-etcd', CONTROL_PLANE_NODE),
    {
      prefix: '/apis/storage.k8s.io/v1',
      plural: 'storageclasses',
      object: {
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: metadata('standard-csi', undefined),
        provisioner: 'ebs.csi.aws.com',
      },
    },
    {
      prefix: CORE,
      plural: 'events',
      object: {
        apiVersion: 'v1',
        kind: 'Event',
        metadata: metadata('web.e2e1', 'shop'),
        involvedObject: { kind: 'Pod', namespace: 'shop', name: REPLICASET_POD, apiVersion: 'v1' },
        reason: 'Started',
        message: EVENT_MESSAGE,
        type: 'Normal',
        count: 1,
        source: { component: 'kubelet', host: WORKER_NODE },
        firstTimestamp: NOW(),
        lastTimestamp: NOW(),
      },
    },
  ];
  if (!openShift) return entries;
  entries.push(
    namespace(OPERATOR_NAMESPACE),
    {
      prefix: CONFIG,
      plural: 'clusterversions',
      object: {
        apiVersion: 'config.openshift.io/v1',
        kind: 'ClusterVersion',
        metadata: metadata('version', undefined),
        spec: { clusterID: CLUSTER_ID, channel: UPDATE_CHANNEL },
        status: {
          desired: {
            version: OPENSHIFT_VERSION,
            image: 'quay.io/openshift-release-dev/ocp-release@sha256:e2e',
          },
          history: [
            {
              state: 'Completed',
              version: OPENSHIFT_VERSION,
              startedTime: '2026-01-01T00:00:00Z',
              completionTime: '2026-01-01T01:00:00Z',
              image: 'e2e',
              verified: false,
            },
          ],
          availableUpdates: [{ version: '4.18.14', image: 'e2e' }],
          conditions: [
            condition('Available', 'True', `Done applying ${OPENSHIFT_VERSION}`),
            condition('Failing', 'False'),
            condition('Progressing', 'False', `Cluster version is ${OPENSHIFT_VERSION}`),
            condition('RetrievedUpdates', 'True'),
          ],
        },
      },
    },
    clusterOperator('authentication'),
    clusterOperator('etcd'),
    {
      prefix: CONFIG,
      plural: 'infrastructures',
      object: {
        apiVersion: 'config.openshift.io/v1',
        kind: 'Infrastructure',
        metadata: metadata('cluster', undefined),
        status: {
          apiServerURL: API_SERVER_URL,
          platform: 'AWS',
          platformStatus: { type: 'AWS', aws: { region: 'us-east-1' } },
          infrastructureName: 'e2e-x7k2p',
        },
      },
    },
    {
      prefix: MACHINE,
      plural: 'machinesets',
      object: {
        apiVersion: 'machine.openshift.io/v1beta1',
        kind: 'MachineSet',
        metadata: metadata('e2e-worker-us-east-1a', 'openshift-machine-api'),
        spec: {
          replicas: 1,
          selector: {
            matchLabels: { 'machine.openshift.io/cluster-api-machineset': 'e2e-worker-us-east-1a' },
          },
          template: {
            metadata: { labels: { 'machine.openshift.io/cluster-api-machineset': 'e2e-worker-us-east-1a' } },
            spec: {},
          },
        },
        status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
      },
    },
    {
      prefix: MACHINE,
      plural: 'machines',
      object: {
        apiVersion: 'machine.openshift.io/v1beta1',
        kind: 'Machine',
        metadata: metadata(WORKER_NODE, 'openshift-machine-api', {
          labels: { 'machine.openshift.io/cluster-api-machineset': 'e2e-worker-us-east-1a' },
        }),
        spec: {},
        status: { phase: 'Running', nodeRef: { kind: 'Node', name: WORKER_NODE } },
      },
    },
    csv(CSV_NAME, OPERATOR_NAMESPACE, CSV_DISPLAY_NAME),
    csv(CSV_NAME, COPY_NAMESPACE, CSV_DISPLAY_NAME, OPERATOR_NAMESPACE),
    csv(ORPHAN_CSV_NAME, OPERATOR_NAMESPACE, ORPHAN_CSV_DISPLAY_NAME),
    {
      prefix: OLM,
      plural: 'subscriptions',
      object: {
        apiVersion: 'operators.coreos.com/v1alpha1',
        kind: 'Subscription',
        metadata: metadata('etcd', OPERATOR_NAMESPACE),
        spec: {
          channel: SUBSCRIPTION_CHANNEL,
          installPlanApproval: 'Automatic',
          name: 'etcd',
          source: CATALOG_SOURCE,
          sourceNamespace: 'openshift-marketplace',
        },
        status: {
          state: 'AtLatestKnown',
          installedCSV: CSV_NAME,
          currentCSV: CSV_NAME,
          lastUpdated: '2026-01-01T01:00:00Z',
        },
      },
    },
  );
  return entries;
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
