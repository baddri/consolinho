import { createServer, type Server } from 'node:https';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { clusterHealthAnswer, type FakeAnswer } from './fakeClusterHealth';
import { selfSignedCertificate } from './fakeKubeApi';

/**
 * How a fake fleet cluster deviates from the healthy OpenShift fake (`fakeClusterHealth.ts`) — CP5c QA (T-0344):
 * - `healthy`: every probe answers as the healthy fake;
 * - `tokenInvalid`: every request is a 401 (the grant's SA token expired/revoked → "Token invalid");
 * - `operatorsForbidden`: the ClusterOperators list is a 403 (→ "Restricted", other cells still render);
 * - `nodeNotReady`: the Nodes Table reports `worker-1` NotReady (→ "Degraded", "2 of 3 Ready, 1 Not Ready").
 */
export type FleetClusterBehaviour = 'healthy' | 'tokenInvalid' | 'operatorsForbidden' | 'nodeNotReady';

/** One request the fake received: path and the raw bearer token, to prove which grant credential a probe used (FBE-2). */
export interface FleetProbeRequest {
  path: string;
  token: string | undefined;
}

/** A running fake fleet cluster. */
export interface FakeFleetCluster {
  url: string;
  /** Every request received since start or the last {@link FakeFleetCluster.reset}. */
  requests: FleetProbeRequest[];
  reset: () => void;
  close: () => Promise<void>;
}

const status = (code: number, reason: string): FakeAnswer => ({
  status: code,
  body: { apiVersion: 'v1', kind: 'Status', status: 'Failure', reason, code, message: `fake API: ${reason}` },
});

/** The Nodes Table of the healthy fake with `worker-1` NotReady (Table rows are `{ cells }`, Status is column 2). */
function withNotReadyWorker(answer: FakeAnswer): FakeAnswer {
  const body = answer.body as { kind?: string; rows?: { cells: unknown[] }[] };
  if (body.kind !== 'Table' || !body.rows) return answer;
  return {
    ...answer,
    body: {
      ...body,
      rows: body.rows.map((row) =>
        row.cells[0] === 'worker-1'
          ? { cells: row.cells.map((cell, i) => (i === 1 ? 'NotReady' : cell)) }
          : row,
      ),
    },
  };
}

function answerFor(behaviour: FleetClusterBehaviour, path: string, accept: string | undefined): FakeAnswer {
  if (behaviour === 'tokenInvalid') return status(401, 'Unauthorized');
  if (behaviour === 'operatorsForbidden' && path === '/apis/config.openshift.io/v1/clusteroperators') {
    return status(403, 'Forbidden');
  }
  const answer = clusterHealthAnswer(path, accept);
  if (!answer) return status(404, 'NotFound');
  return behaviour === 'nodeNotReady' && path === '/api/v1/nodes' ? withNotReadyWorker(answer) : answer;
}

/**
 * Starts an HTTPS fake API server for the fleet overview e2e (QG5C-2): the fleet status probes per `behaviour`, idle
 * watches (the cluster Overview page a row click opens), a denied SelfSubjectAccessReview, Kubernetes 404s otherwise.
 * Records the bearer token of every request.
 */
export async function startFakeFleetCluster(behaviour: FleetClusterBehaviour): Promise<FakeFleetCluster> {
  const certificate = selfSignedCertificate();
  const requests: FleetProbeRequest[] = [];
  const server: Server = createServer(
    { key: certificate.key, cert: certificate.cert },
    (request, response) => {
      const url = new URL(request.url ?? '/', 'https://fake');
      const authorization = request.headers.authorization;
      requests.push({
        path: url.pathname,
        token: authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined,
      });
      const send = ({ status: code, body }: FakeAnswer) => {
        response.writeHead(code, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (
        behaviour !== 'tokenInvalid' &&
        request.method === 'POST' &&
        url.pathname.endsWith('/selfsubjectaccessreviews')
      ) {
        send({
          status: 201,
          body: {
            apiVersion: 'authorization.k8s.io/v1',
            kind: 'SelfSubjectAccessReview',
            status: { allowed: false },
          },
        });
        return;
      }
      if (request.method !== 'GET') {
        send(status(405, 'MethodNotAllowed'));
        return;
      }
      if (behaviour !== 'tokenInvalid' && ['true', '1'].includes(url.searchParams.get('watch') ?? '')) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
        response.flushHeaders();
        return;
      }
      send(answerFor(behaviour, url.pathname, request.headers.accept));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${String(port)}`,
    requests,
    reset: () => {
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        certificate.dispose();
      }),
  };
}

/**
 * An `https://127.0.0.1:<port>` URL nothing listens on (a port bound and released at once), for an "Unreachable"
 * cluster (connection refused).
 */
export async function closedPortUrl(): Promise<string> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `https://127.0.0.1:${String(port)}`;
}
