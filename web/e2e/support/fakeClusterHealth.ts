import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Cluster health answers of the e2e fake API server (CP5c, T-0341): what the Api's fleet status probes read (contract
 * §3) — Nodes and ClusterOperators as a `meta.k8s.io/v1` `Table` when `Accept` asks for one (else a plain list, for the
 * Nodes page), the ClusterVersion `version` and `/version`. The fake is a healthy OpenShift 4.18 cluster with three
 * Ready nodes and three Available operators.
 */

/** OpenShift version of the fake's ClusterVersion; its Kubernetes `gitVersion` is {@link FAKE_KUBERNETES_VERSION}. */
export const FAKE_OPENSHIFT_VERSION = '4.18.12';
export const FAKE_KUBERNETES_VERSION = 'v1.31.4';

const NODES = ['control-plane-1', 'worker-1', 'worker-2'] as const;
const OPERATORS = ['authentication', 'ingress', 'kube-apiserver'] as const;
const CREATED = '2026-01-01T00:00:00Z';

/** A fake answer: status and JSON body. */
export interface FakeAnswer {
  status: number;
  body: unknown;
}

/** Whether `accept` asks for a server-side Table (`application/json;as=Table;v=v1;g=meta.k8s.io`). */
export function wantsTable(accept: string | undefined): boolean {
  return (accept ?? '').split(',').some((type) => /;\s*as=Table\b/i.test(type));
}

interface Column {
  name: string;
  type: string;
}

/** A `meta.k8s.io/v1` Table with `includeObject=None` rows: cells only, no objects. */
function table(columns: readonly Column[], rows: readonly unknown[][]) {
  return {
    kind: 'Table',
    apiVersion: 'meta.k8s.io/v1',
    metadata: { resourceVersion: '100' },
    columnDefinitions: columns.map((column) => ({
      ...column,
      format: column.name === 'Name' ? 'name' : '',
      description: '',
      priority: 0,
    })),
    rows: rows.map((cells) => ({ cells })),
  };
}

const metadata = (name: string) => ({
  name,
  uid: `uid-${name}`,
  resourceVersion: '100',
  creationTimestamp: CREATED,
});

const node = (name: string) => ({
  apiVersion: 'v1',
  kind: 'Node',
  metadata: {
    ...metadata(name),
    labels: { [`node-role.kubernetes.io/${name.startsWith('worker') ? 'worker' : 'master'}`]: '' },
  },
  status: {
    conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }],
    nodeInfo: { kubeletVersion: FAKE_KUBERNETES_VERSION },
  },
});

const condition = (type: string, status: 'True' | 'False') => ({ type, status, lastTransitionTime: CREATED });

const clusterOperator = (name: string) => ({
  apiVersion: 'config.openshift.io/v1',
  kind: 'ClusterOperator',
  metadata: metadata(name),
  status: {
    conditions: [
      condition('Available', 'True'),
      condition('Progressing', 'False'),
      condition('Degraded', 'False'),
    ],
    versions: [{ name: 'operator', version: FAKE_OPENSHIFT_VERSION }],
  },
});

const clusterVersion = {
  apiVersion: 'config.openshift.io/v1',
  kind: 'ClusterVersion',
  metadata: metadata('version'),
  spec: { channel: 'stable-4.18', clusterID: '00000000-0000-4000-8000-000000000000' },
  status: {
    desired: { version: FAKE_OPENSHIFT_VERSION, image: `quay.io/example/release:${FAKE_OPENSHIFT_VERSION}` },
    history: [
      { state: 'Completed', version: FAKE_OPENSHIFT_VERSION, startedTime: CREATED, completionTime: CREATED },
    ],
    conditions: [
      condition('Available', 'True'),
      condition('Progressing', 'False'),
      condition('Failing', 'False'),
    ],
    availableUpdates: null,
  },
};

const list = (apiVersion: string, kind: string, items: unknown[]) => ({
  apiVersion,
  kind,
  metadata: { resourceVersion: '100' },
  items,
});

function nodes(asTable: boolean): unknown {
  if (!asTable) return list('v1', 'NodeList', NODES.map(node));
  return table(
    [
      { name: 'Name', type: 'string' },
      { name: 'Status', type: 'string' },
      { name: 'Roles', type: 'string' },
      { name: 'Age', type: 'string' },
      { name: 'Version', type: 'string' },
    ],
    NODES.map((name) => [
      name,
      'Ready',
      name.startsWith('worker') ? 'worker' : 'control-plane,master',
      '300d',
      FAKE_KUBERNETES_VERSION,
    ]),
  );
}

function clusterOperators(asTable: boolean): unknown {
  if (!asTable) return list('config.openshift.io/v1', 'ClusterOperatorList', OPERATORS.map(clusterOperator));
  return table(
    [
      { name: 'Name', type: 'string' },
      { name: 'Version', type: 'string' },
      { name: 'Available', type: 'string' },
      { name: 'Progressing', type: 'string' },
      { name: 'Degraded', type: 'string' },
      { name: 'Since', type: 'date' },
      { name: 'Message', type: 'string' },
    ],
    OPERATORS.map((name) => [name, FAKE_OPENSHIFT_VERSION, 'True', 'False', 'False', '300d', '']),
  );
}

/**
 * The fake's answer to a GET of `path` with `accept`, or `undefined` when the path is not a health resource (the
 * caller answers it). Query parameters such as `includeObject=None` don't change the answer.
 */
export function clusterHealthAnswer(path: string, accept: string | undefined): FakeAnswer | undefined {
  const asTable = wantsTable(accept);
  switch (path) {
    case '/api/v1/nodes':
      return { status: 200, body: nodes(asTable) };
    case '/apis/config.openshift.io/v1/clusteroperators':
      return { status: 200, body: clusterOperators(asTable) };
    case '/apis/config.openshift.io/v1/clusterversions/version':
      return { status: 200, body: clusterVersion };
    case '/version':
      return {
        status: 200,
        body: { major: '1', minor: '31', gitVersion: FAKE_KUBERNETES_VERSION, platform: 'linux/amd64' },
      };
    default:
      return undefined;
  }
}

/** Dispatch hook of `fakeKubeApi.ts`: answers a GET health request and returns `true`, else leaves it and returns `false`. */
export function serveClusterHealth(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  if (request.method !== 'GET') return false;
  const answer = clusterHealthAnswer(url.pathname, request.headers.accept);
  if (!answer) return false;
  response.writeHead(answer.status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(answer.body));
  return true;
}
