import { ws } from 'msw';
import { PodModel, type Pod } from '@/shared/k8s';
import { actorName, currentMockUser, findCluster, findCredential, mockDb, recordAudit } from '../db';
import { proxyMutationListeners } from './handlers';
import { proxyAuditInput, type ProxyDenialReason, type ProxyMutation } from './proxyAudit';
import { isAllowed, profileOf } from './rbac';
import { getObject, subscribe } from './store';

/**
 * The mock exec relay (T-0180, ADR-0037 §5): `ws.link` on the proxy's pods/exec URL, playing an echo shell over
 * `base64.channel.k8s.io`. It is not a `SUBRESOURCES` entry: those run behind the HTTP proxy guard as reads (GET), so
 * `view` users could exec. Instead it applies the proxy's checks itself — grant, read-only user, read-only grant, then
 * the cluster's `create pods/exec` RBAC — and refuses the upgrade like the browser sees it (close 1006, no reason).
 * Every attempt is audited at the handshake, as the Api does (T-0156). The shell prints `$ `, echoes stdin (TTY echo),
 * prints a new prompt on Enter and ends with `exit` (error channel `Success`, close 1000).
 */

/** One open exec session, for tests (`mockK8s.execSessions()`). */
export interface MockExecSession {
  cluster: string;
  namespace: string;
  pod: string;
  container: string;
  /** Resize frames received, as `[cols, rows]`. */
  resizes: [number, number][];
  /** Everything typed, decoded. */
  stdin: string;
  close: (code: number, reason?: string) => void;
}

const sessions = new Set<MockExecSession>();
/** Clusters whose sessions `resetK8sStore` already knows to close. */
const subscribedClusters = new Set<string>();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(text: string): string {
  let binary = '';
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): string {
  const binary = atob(base64);
  return decoder.decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** Closes the cluster's sessions when the store resets (`resetMockDb` between tests). */
function trackCluster(cluster: string): void {
  if (subscribedClusters.has(cluster)) return;
  subscribedClusters.add(cluster);
  subscribe(cluster, {
    onChange: () => undefined,
    close: () => {
      subscribedClusters.delete(cluster);
      for (const session of [...sessions]) if (session.cluster === cluster) session.close(1006);
    },
  });
}

function audit(mutation: ProxyMutation): void {
  recordAudit(proxyAuditInput(actorName(), mutation));
  for (const listener of proxyMutationListeners) listener(mutation);
}

/** Why the proxy or the cluster refuses the upgrade, or `undefined` when it may proceed. */
function refusal(cluster: string): ProxyDenialReason | 'rbac' | 'unauthenticated' | undefined {
  const user = currentMockUser();
  if (!user) return 'unauthenticated';
  const grant = findCluster(cluster)?.isEnabled
    ? mockDb.grants.find((g) => g.username === user.username && g.clusterName === cluster)
    : undefined;
  const credential = grant && findCredential(grant.credentialId, cluster);
  if (!grant || !credential) return 'noAccess';
  if (user.isReadOnly) return 'userReadOnly';
  if (grant.accessMode === 'readOnly') return 'readOnlyGrant';
  if (!isAllowed(profileOf(credential), 'create', 'pods/exec')) return 'rbac';
  return undefined;
}

/** Whether `container` of the stored pod is running (exec needs a running container). */
function isRunning(pod: Pod | undefined, container: string): boolean {
  return pod?.status?.containerStatuses?.some((s) => s.name === container && s.state?.running) ?? false;
}

/** The exec link; registered among the handlers after the HTTP proxy (`handlers/index.ts`). */
export const execHandler = ws
  .link('*/api/clusters/:cluster/k8s/api/v1/namespaces/:namespace/pods/:pod/exec')
  .addEventListener('connection', ({ client, params }) => {
    const cluster = decodeURIComponent(String(params.cluster));
    const namespace = decodeURIComponent(String(params.namespace));
    const podName = decodeURIComponent(String(params.pod));
    const container = client.url.searchParams.get('container') ?? '';
    const path = `/api/v1/namespaces/${namespace}/pods/${podName}/exec`;

    const refused = refusal(cluster);
    if (refused !== undefined) {
      if (refused !== 'unauthenticated') {
        audit({
          cluster,
          method: 'GET',
          path,
          status: 403,
          reason: refused === 'rbac' ? null : refused,
        });
      }
      // The proxy/API server answers the upgrade with an HTTP error: the browser only sees an abnormal close.
      client.close(1006);
      return;
    }
    const pod = getObject(cluster, PodModel, namespace, podName) as Pod | undefined;
    if (!pod) {
      audit({ cluster, method: 'GET', path, status: 404, reason: null });
      client.close(1006);
      return;
    }
    audit({ cluster, method: 'GET', path, status: 101, reason: null });
    trackCluster(cluster);

    const send = (channel: number, text: string) => client.send(`${channel}${toBase64(text)}`);
    const session: MockExecSession = {
      cluster,
      namespace,
      pod: podName,
      container,
      resizes: [],
      stdin: '',
      close: (code, reason) => {
        sessions.delete(session);
        client.close(code, reason);
      },
    };
    client.addEventListener('close', () => sessions.delete(session));
    // MSW delivers `send`s asynchronously; closing in the same tick would overtake them (the Enter echo, the error
    // channel), so the client would print the close message before the last output. A real server flushes first.
    const closeAfterOutput = (code: number) => setTimeout(() => session.close(code), 0);

    if (!isRunning(pod, container)) {
      // The kubelet's answer for a container that isn't running: a Failure status on the error channel.
      send(
        3,
        JSON.stringify({
          status: 'Failure',
          message: `unable to upgrade connection: container not found ("${container}")`,
          reason: 'BadRequest',
          code: 400,
        }),
      );
      closeAfterOutput(1000);
      return;
    }
    sessions.add(session);

    let line = '';
    send(1, '$ ');
    client.addEventListener('message', ({ data }) => {
      if (typeof data !== 'string' || data.length === 0) return;
      const payload = fromBase64(data.slice(1));
      if (data.startsWith('4')) {
        const { Width, Height } = JSON.parse(payload) as { Width: number; Height: number };
        session.resizes.push([Width, Height]);
        return;
      }
      if (!data.startsWith('0')) return;
      session.stdin += payload;
      for (const char of payload) {
        if (char === '\r' || char === '\n') {
              send(1, '\r\n');
          if (line.trim() === 'exit') {
            send(3, JSON.stringify({ metadata: {}, status: 'Success' }));
            closeAfterOutput(1000);
            return;
          }
          line = '';
          send(1, '$ ');
        } else if (char === '\x7f') {
          if (line) send(1, '\b \b');
          line = line.slice(0, -1);
        } else {
          line += char;
          send(1, char);
        }
      }
    });
  });

/** Test and dev helpers of the exec relay, merged into `mockK8s`. */
export const mockExec = {
  /** The open exec sessions (live objects; `resizes`/`stdin` keep growing). */
  execSessions(): MockExecSession[] {
    return [...sessions];
  },
  /**
   * Closes every open session as the proxy would: default 1006 (connection lost); the 60-min cap (ADR-0036) closes
   * with a reason.
   */
  closeExec(code = 1006, reason?: string): void {
    for (const session of [...sessions]) session.close(code, reason);
  },
};
