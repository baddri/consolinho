import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import jsonPatch, { type Operation } from 'fast-json-patch';
import { selfSignedCertificate } from './fakeKubeApi';
import { acceptWebSocket } from './webSocket';

/** The namespace, Deployment, its pod and container the CP4a workloads spec drives. */
export const WORK_NAMESPACE = 'e2e-work';
export const DEPLOYMENT = 'web';
export const POD = 'web-6d9f7c5b8-x2k4p';
export const CONTAINER = 'app';
/** The ReplicaSets of {@link DEPLOYMENT}: revision 2 (current) and revision 1 (rollback target, older image). */
export const CURRENT_REPLICASET = 'web-6d9f7c5b8';
export const OLD_REPLICASET = 'web-5c8b6f9d7';
export const OLD_IMAGE = 'registry.example.com/web:1';

/** ServiceAccount names in the fake tokens: the editor may do anything, the viewer only read (cluster RBAC). */
export const EDITOR_SA = 'e2e-editor';
export const VIEWER_SA = 'e2e-viewer';

/** One request the fake received through the FleetConsole proxy. */
export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** The ServiceAccount name in the bearer token (`sub`), `undefined` without a readable token. */
  serviceAccount: string | undefined;
  /** The raw bearer token, to prove which grant credential the proxy forwarded (SAFE-2). */
  token: string | undefined;
  contentType: string | undefined;
  /** Parsed JSON body of a PATCH/POST. */
  body: unknown;
}

/** A running stateful fake API server for the CP4a workloads spec. */
export interface FakeWorkloadsApi {
  url: string;
  /** Every request so far (cleared by {@link reset}). */
  requests: RecordedRequest[];
  /** Requests the fake did not know (404), to spot gaps when the UI grows. */
  unknown: string[];
  /** Restores the seeded objects and logs and forgets recorded requests. */
  reset: () => void;
  /** The stored Deployment (live object). */
  deployment: () => K8sObject;
  /** Writes a line to the current log of {@link POD}, streamed to every following reader. */
  appendLog: (text: string) => void;
  close: () => Promise<void>;
}

/** A loosely typed Kubernetes object: the fake only touches metadata and a few spec/status fields. */
export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid: string;
    resourceVersion: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; uid: string; controller?: boolean }[];
  };
  spec?: Record<string, unknown> & { replicas?: number; paused?: boolean };
  status?: Record<string, unknown>;
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
  name: string | undefined;
  response: ServerResponse;
}

/** One log line with its RFC 3339 timestamp. */
interface LogLine {
  ts: string;
  text: string;
}

/**
 * An obviously fake, unsigned ServiceAccount-shaped JWT for `serviceAccount` (canonical base64url segments, T-0043:
 * otherwise the Api classifies the token as opaque).
 */
export function fakeServiceAccountToken(serviceAccount: string): string {
  const segment = (value: object | string) =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  return [
    segment({ alg: 'RS256', kid: 'fake-e2e' }),
    segment({
      iss: 'kubernetes/serviceaccount',
      sub: `system:serviceaccount:fleet:${serviceAccount}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    segment('fake-signature-not-a-real-token'),
  ].join('.');
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

/** `/api/v1|/apis/<g>/<v>` `[/namespaces/<ns>]` `/<plural>[/<name>[/<subresource>]]`. */
const RESOURCE_PATH =
  /^(\/api\/v1|\/apis\/[^/]+\/[^/]+)(?:\/namespaces\/([^/]+))?\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

const EXEC_SUBPROTOCOL = 'base64.channel.k8s.io';

/**
 * Starts a stateful Kubernetes API stand-in for the CP4a e2e (QGA-2): one Deployment with two ReplicaSets (revisions
 * 2 and 1) and its running pod, behind the real FleetConsole proxy. It serves lists, gets and watches (MODIFIED events
 * after every change), JSON Patch on objects and on `…/scale` (`fast-json-patch`, as the MSW mock), pod logs
 * (`follow` streams until the client goes; `previous`; `sinceTime`), and `pods/exec` over `base64.channel.k8s.io`
 * with an echo shell. RBAC is by token: the editor SA is allowed everything, the viewer only reads (SSAR denied,
 * writes 403). Every request is recorded so the spec can assert what the proxy forwarded, and with which token.
 */
export async function startFakeWorkloadsApi(): Promise<FakeWorkloadsApi> {
  const certificate = selfSignedCertificate();
  let entries: Entry[] = [];
  let previousLog: LogLine[] = [];
  let currentLog: LogLine[] = [];
  let revision = 100;
  const watchers = new Set<Watcher>();
  /** Open `follow` readers and how each formats a line (with or without timestamps). */
  const logFollowers = new Map<ServerResponse, (l: LogLine) => string>();
  const requests: RecordedRequest[] = [];
  const unknown: string[] = [];

  const reset = () => {
    entries = seed();
    previousLog = [line(-120_000, 'starting web v2'), line(-119_000, 'panic: config reload failed')];
    currentLog = [line(-60_000, 'starting web v2'), line(-59_000, 'listening on :8080')];
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

  const store = (entry: Entry, next: K8sObject) => {
    revision += 1;
    next.metadata.resourceVersion = String(revision);
    entry.object = next;
    for (const watcher of watchers) {
      if (
        watcher.prefix === entry.prefix &&
        watcher.plural === entry.plural &&
        (watcher.namespace === undefined || watcher.namespace === next.metadata.namespace) &&
        (watcher.name === undefined || watcher.name === next.metadata.name)
      ) {
        watcher.response.write(`${JSON.stringify({ type: 'MODIFIED', object: next })}\n`);
      }
    }
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
        status(403, 'Forbidden', `${plural} "${name ?? ''}" is forbidden: User "${String(serviceAccount)}" cannot ${method.toLowerCase()}`),
      );
      return;
    }
    if (name === undefined) {
      if (method !== 'GET') {
        json(response, 405, status(405, 'MethodNotAllowed', 'fake API: collections are read-only'));
        return;
      }
      if (plural === 'events') {
        json(response, 200, { apiVersion: 'v1', kind: 'List', metadata: { resourceVersion: String(revision) }, items: [] });
        return;
      }
      if (!entries.some((e) => e.prefix === prefix && e.plural === plural)) {
        notFound(response, `${method} ${url.pathname}`);
        return;
      }
      const fieldName = /metadata\.name=([^,]+)/.exec(url.searchParams.get('fieldSelector') ?? '')?.[1];
      if (isWatch(url)) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
        response.flushHeaders();
        const watcher: Watcher = { prefix, plural, namespace, name: fieldName, response };
        watchers.add(watcher);
        request.on('close', () => watchers.delete(watcher));
        return;
      }
      const selector = parseSelector(url.searchParams.get('labelSelector'));
      const items = entries
        .filter((e) => e.prefix === prefix && e.plural === plural)
        .map((e) => e.object)
        .filter((o) => namespace === undefined || o.metadata.namespace === namespace)
        .filter((o) => fieldName === undefined || o.metadata.name === fieldName)
        .filter((o) => Object.entries(selector).every(([k, v]) => o.metadata.labels?.[k] === v));
      const kind = entries.find((e) => e.prefix === prefix && e.plural === plural)?.object.kind ?? 'List';
      json(response, 200, {
        apiVersion: prefix.replace(/^\/apis?\//, ''),
        kind: `${kind}List`,
        metadata: { resourceVersion: String(revision) },
        items,
      });
      return;
    }

    const entry = find(prefix, plural, namespace, name);
    if (!entry) {
      notFound(response, `${method} ${url.pathname}`);
      return;
    }
    if (subresource === 'log' && method === 'GET') {
      serveLog(url, request, response);
      return;
    }
    if (subresource === 'scale') {
      const scale = scaleOf(entry.object);
      if (method === 'GET') {
        json(response, 200, scale);
        return;
      }
      const patched = patchOrFail(response, record, scale);
      if (!patched) return;
      const next = structuredClone(entry.object);
      next.spec = { ...next.spec, replicas: patched.spec.replicas };
      store(entry, settle(next));
      json(response, 200, scaleOf(entry.object));
      return;
    }
    if (subresource !== undefined) {
      notFound(response, `${method} ${url.pathname}`);
      return;
    }
    if (method === 'GET') {
      json(response, 200, entry.object);
      return;
    }
    if (method === 'PATCH') {
      const patched = patchOrFail(response, record, entry.object);
      if (!patched) return;
      store(entry, settle(patched));
      json(response, 200, entry.object);
      return;
    }
    json(response, 405, status(405, 'MethodNotAllowed', `fake API: ${method} is not served`));
  }

  /** `…/log`: the previous log (ends), or the current one from `sinceTime`, kept open with `follow`. */
  function serveLog(url: URL, request: IncomingMessage, response: ServerResponse): void {
    const timestamps = url.searchParams.get('timestamps') === 'true';
    const format = ({ ts, text }: LogLine) => `${timestamps ? `${ts} ` : ''}${text}\n`;
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' });
    if (url.searchParams.get('previous') === 'true') {
      response.end(previousLog.map(format).join(''));
      return;
    }
    const since = url.searchParams.get('sinceTime');
    const lines = since ? currentLog.filter((l) => l.ts >= since) : currentLog;
    response.write(lines.map(format).join(''));
    if (url.searchParams.get('follow') !== 'true') {
      response.end();
      return;
    }
    logFollowers.set(response, format);
    request.on('close', () => logFollowers.delete(response));
  }

  /** Applies the recorded JSON Patch to a copy of `document`; answers 415/422 itself and returns `undefined`. */
  function patchOrFail<T extends object>(response: ServerResponse, record: RecordedRequest, document: T): T | undefined {
    if (record.contentType?.split(';')[0]?.trim() !== 'application/json-patch+json') {
      json(response, 415, status(415, 'UnsupportedMediaType', 'fake API: JSON Patch only'));
      return undefined;
    }
    try {
      return jsonPatch.applyPatch(structuredClone(document), record.body as Operation[], true).newDocument;
    } catch (error) {
      json(response, 422, status(422, 'Invalid', String(error).split('\n')[0] ?? 'invalid patch'));
      return undefined;
    }
  }

  server.on('upgrade', (request: IncomingMessage, socket) => {
    const url = new URL(request.url ?? '/', 'https://fake');
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    const serviceAccount = serviceAccountOf(token);
    requests.push({
      method: 'UPGRADE',
      path: url.pathname,
      query: url.searchParams,
      serviceAccount,
      token,
      contentType: undefined,
      body: undefined,
    });
    const offered = (request.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((p) => p.trim());
    const match = RESOURCE_PATH.exec(url.pathname);
    const pod = match?.[3] === 'pods' && match[5] === 'exec' ? find('/api/v1', 'pods', match[2], match[4] ?? '') : undefined;
    const refuse = (code: number, reason: string) => {
      const body = JSON.stringify(status(code, reason, `fake API: exec ${reason}`));
      socket.end(
        `HTTP/1.1 ${String(code)} ${reason}\r\nContent-Type: application/json\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close\r\n\r\n${body}`,
      );
    };
    if (!pod) {
      refuse(404, 'NotFound');
      return;
    }
    if (serviceAccount !== EDITOR_SA) {
      refuse(403, 'Forbidden');
      return;
    }
    if (!offered.includes(EXEC_SUBPROTOCOL)) {
      refuse(400, 'BadRequest');
      return;
    }

    // An echo shell, like the MSW mock (mocks/k8s/exec.ts): prompt, TTY echo, new prompt on Enter, `exit` ends.
    const peer = acceptWebSocket(request, socket, EXEC_SUBPROTOCOL);
    const send = (channel: number, text: string) => peer.send(`${String(channel)}${Buffer.from(text).toString('base64')}`);
    let lineBuffer = '';
    send(1, '$ ');
    peer.onText((frame) => {
      if (!frame.startsWith('0')) return; // resize (4) and others: nothing to do
      for (const char of Buffer.from(frame.slice(1), 'base64').toString('utf8')) {
        if (char === '\r' || char === '\n') {
          send(1, '\r\n');
          const command = lineBuffer.trim();
          lineBuffer = '';
          if (command === 'exit') {
            send(3, JSON.stringify({ metadata: {}, status: 'Success' }));
            peer.close(1000);
            return;
          }
          const echoed = /^echo (.*)$/.exec(command)?.[1];
          if (echoed !== undefined) send(1, `${echoed}\r\n`);
          send(1, '$ ');
        } else if (char === '\x7f') {
          if (lineBuffer) send(1, '\b \b');
          lineBuffer = lineBuffer.slice(0, -1);
        } else {
          lineBuffer += char;
          send(1, char);
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${String(port)}`,
    requests,
    unknown,
    reset,
    deployment: () => {
      const entry = find('/apis/apps/v1', 'deployments', WORK_NAMESPACE, DEPLOYMENT);
      if (!entry) throw new Error('fake API: the Deployment is gone');
      return entry.object;
    },
    appendLog: (text) => {
      const entry = line(0, text);
      currentLog.push(entry);
      for (const [follower, format] of logFollowers) follower.write(format(entry));
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        certificate.dispose();
      }),
  };

  function notFound(response: ServerResponse, what: string): void {
    unknown.push(what);
    json(response, 404, status(404, 'NotFound', `fake API: ${what} not found`));
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

function parseSelector(selector: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const term of (selector ?? '').split(',').filter(Boolean)) {
    const [key, value] = term.split('=');
    if (key && value !== undefined) result[key] = value;
  }
  return result;
}

/** A log line `offsetMs` from now (RFC 3339 with nanoseconds, as the kubelet writes them). */
function line(offsetMs: number, text: string): LogLine {
  return { ts: new Date(Date.now() + offsetMs).toISOString().replace(/\.(\d{3})Z$/, '.$1000000Z'), text };
}

/** The controller's view after a write: the Deployment's status follows `spec.replicas` at once. */
function settle(object: K8sObject): K8sObject {
  if (object.kind !== 'Deployment') return object;
  const replicas = object.spec?.replicas ?? 1;
  object.status = {
    ...object.status,
    replicas,
    updatedReplicas: replicas,
    readyReplicas: replicas,
    availableReplicas: replicas,
  };
  return object;
}

function scaleOf(object: K8sObject) {
  const { name, namespace, uid, resourceVersion, creationTimestamp } = object.metadata;
  return {
    apiVersion: 'autoscaling/v1',
    kind: 'Scale',
    metadata: { name, namespace, uid, resourceVersion, creationTimestamp },
    spec: { replicas: object.spec?.replicas ?? 1 },
    status: { replicas: (object.status?.replicas as number | undefined) ?? 0, selector: `app=${DEPLOYMENT}` },
  };
}

const CREATED = '2026-11-01T00:00:00Z';
const DEPLOYMENT_UID = '00000000-0000-4000-8000-00000000d001';

function meta(name: string, uid: string, extra: Partial<K8sObject['metadata']> = {}): K8sObject['metadata'] {
  return { name, namespace: WORK_NAMESPACE, uid, resourceVersion: '100', creationTimestamp: CREATED, ...extra };
}

function template(hash: string, image: string) {
  return {
    metadata: { labels: { app: DEPLOYMENT, 'pod-template-hash': hash } },
    spec: { containers: [{ name: CONTAINER, image }] },
  };
}

function replicaSet(name: string, hash: string, revisionNumber: string, image: string, replicas: number): Entry {
  return {
    prefix: '/apis/apps/v1',
    plural: 'replicasets',
    object: {
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: meta(name, `00000000-0000-4000-8000-0000000${revisionNumber}0001`.slice(0, 36), {
        labels: { app: DEPLOYMENT, 'pod-template-hash': hash },
        annotations: { 'deployment.kubernetes.io/revision': revisionNumber },
        ownerReferences: [
          { apiVersion: 'apps/v1', kind: 'Deployment', name: DEPLOYMENT, uid: DEPLOYMENT_UID, controller: true },
        ],
      }),
      spec: {
        replicas,
        selector: { matchLabels: { app: DEPLOYMENT, 'pod-template-hash': hash } },
        template: template(hash, image),
      },
      status: { replicas, readyReplicas: replicas, availableReplicas: replicas },
    },
  };
}

/** The seeded objects: namespace, Deployment `web` (1 replica, revision 2), its two ReplicaSets and its pod. */
function seed(): Entry[] {
  const currentHash = CURRENT_REPLICASET.slice(DEPLOYMENT.length + 1);
  const oldHash = OLD_REPLICASET.slice(DEPLOYMENT.length + 1);
  const image = 'registry.example.com/web:2';
  return [
    {
      prefix: '/api/v1',
      plural: 'namespaces',
      object: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: WORK_NAMESPACE, uid: '00000000-0000-4000-8000-00000000a001', resourceVersion: '100', creationTimestamp: CREATED },
        status: { phase: 'Active' },
      },
    },
    {
      prefix: '/apis/apps/v1',
      plural: 'deployments',
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: meta(DEPLOYMENT, DEPLOYMENT_UID, {
          labels: { app: DEPLOYMENT },
          annotations: { 'deployment.kubernetes.io/revision': '2' },
        }),
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: DEPLOYMENT } },
          strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
          template: template(currentHash, image),
        },
        status: {
          observedGeneration: 1,
          replicas: 1,
          updatedReplicas: 1,
          readyReplicas: 1,
          availableReplicas: 1,
          conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }],
        },
      },
    },
    replicaSet(CURRENT_REPLICASET, currentHash, '2', image, 1),
    replicaSet(OLD_REPLICASET, oldHash, '1', OLD_IMAGE, 0),
    {
      prefix: '/api/v1',
      plural: 'pods',
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: meta(POD, '00000000-0000-4000-8000-00000000b001', {
          labels: { app: DEPLOYMENT, 'pod-template-hash': currentHash },
          ownerReferences: [
            { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: CURRENT_REPLICASET, uid: '00000000-0000-4000-8000-000000020001', controller: true },
          ],
        }),
        spec: { containers: [{ name: CONTAINER, image }], nodeName: 'worker-1' },
        status: {
          phase: 'Running',
          podIP: '10.128.0.42',
          startTime: CREATED,
          conditions: [{ type: 'Ready', status: 'True' }],
          containerStatuses: [
            {
              name: CONTAINER,
              image,
              ready: true,
              started: true,
              restartCount: 1,
              state: { running: { startedAt: CREATED } },
              lastState: { terminated: { exitCode: 2, reason: 'Error', finishedAt: CREATED } },
            },
          ],
        },
      },
    },
  ];
}
