import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Namespace and pod the fake cluster serves; the browsing spec asserts on them. */
export const FAKE_NAMESPACE = 'e2e-smoke';
export const FAKE_POD = 'e2e-smoke-pod';

/** A running fake API server: its `https://127.0.0.1:<port>` URL and a `close` for teardown. */
export interface FakeKubeApi {
  url: string;
  close: () => Promise<void>;
}

/**
 * Starts a minimal Kubernetes API server stand-in for the e2e smoke (QG-4). The dev stack has no cluster to proxy to,
 * and the proxy only accepts `https://` clusters, so this serves HTTPS with a throw-away self-signed certificate
 * (generated with `openssl`; the cluster is registered with `skipTlsVerify`). It answers just enough for the Pods list
 * and details pages through the real FleetConsole proxy: the pod itself, pod/namespace/project lists, a watch that stays open without events, and
 * a "denied" SelfSubjectAccessReview. Everything else is a Kubernetes-style 404 `Status`.
 */
export async function startFakeKubeApi(): Promise<FakeKubeApi> {
  const certificate = selfSignedCertificate();
  const server: Server = createServer(
    { key: certificate.key, cert: certificate.cert },
    (request, response) => {
      const url = new URL(request.url ?? '/', 'https://fake');
      const json = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (request.method === 'POST' && url.pathname.endsWith('/selfsubjectaccessreviews')) {
        json(201, {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          status: { allowed: false },
        });
        return;
      }
      if (request.method !== 'GET') {
        json(405, status(405, 'MethodNotAllowed'));
        return;
      }
      if (url.searchParams.get('watch') === 'true' || url.searchParams.get('watch') === '1') {
        // An idle watch: headers now, no events; ends when the proxy/browser closes the stream.
        response.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
        response.flushHeaders();
        return;
      }
      if (url.pathname === `/api/v1/namespaces/${FAKE_NAMESPACE}/pods/${FAKE_POD}`) {
        json(200, pod);
        return;
      }
      const list = listFor(url.pathname);
      if (list) json(200, list);
      else json(404, status(404, 'NotFound'));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        certificate.dispose();
      }),
  };
}

/** A throw-away self-signed certificate for `127.0.0.1` (PEM) and a `dispose` that deletes its temp files. */
export interface SelfSignedCertificate {
  key: Buffer;
  cert: Buffer;
  dispose: () => void;
}

/**
 * Generates a one-day self-signed certificate for `127.0.0.1` with `openssl`, for the fake API servers (the proxy only
 * accepts `https://` clusters; the e2e clusters are registered with `skipTlsVerify`).
 */
export function selfSignedCertificate(): SelfSignedCertificate {
  const certDir = mkdtempSync(join(tmpdir(), 'fleetconsole-e2e-'));
  const keyPath = join(certDir, 'key.pem');
  const certPath = join(certDir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { stdio: 'ignore' },
  );
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    dispose: () => rmSync(certDir, { recursive: true, force: true }),
  };
}

const metadata = (name: string, namespace?: string) => ({
  name,
  ...(namespace ? { namespace } : {}),
  uid: `00000000-0000-4000-8000-${name.length.toString().padStart(12, '0')}`,
  resourceVersion: '100',
  creationTimestamp: '2026-01-01T00:00:00Z',
});

const pod = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: metadata(FAKE_POD, FAKE_NAMESPACE),
  spec: { containers: [{ name: 'app', image: 'registry.example.com/app:1' }] },
  status: {
    phase: 'Running',
    containerStatuses: [{ name: 'app', ready: true, restartCount: 0, image: 'registry.example.com/app:1' }],
  },
};

/** The list document for a collection path, or `undefined` for anything the fake does not serve. */
function listFor(path: string): unknown {
  const listOf = (apiVersion: string, kind: string, items: unknown[]) => ({
    apiVersion,
    kind,
    metadata: { resourceVersion: '100' },
    items,
  });
  if (path === '/api/v1/pods' || path === `/api/v1/namespaces/${FAKE_NAMESPACE}/pods`) {
    return listOf('v1', 'PodList', [pod]);
  }
  if (/^\/api\/v1\/namespaces\/[^/]+\/pods$/.test(path)) return listOf('v1', 'PodList', []);
  if (path === '/api/v1/namespaces') {
    return listOf('v1', 'NamespaceList', [
      { apiVersion: 'v1', kind: 'Namespace', metadata: metadata(FAKE_NAMESPACE) },
    ]);
  }
  if (path === '/apis/project.openshift.io/v1/projects') {
    return listOf('project.openshift.io/v1', 'ProjectList', [
      { apiVersion: 'project.openshift.io/v1', kind: 'Project', metadata: metadata(FAKE_NAMESPACE) },
    ]);
  }
  return undefined;
}

function status(code: number, reason: string) {
  return {
    apiVersion: 'v1',
    kind: 'Status',
    status: 'Failure',
    reason,
    code,
    message: `fake API: ${reason}`,
  };
}
