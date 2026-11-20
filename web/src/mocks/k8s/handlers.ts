import { http } from '../handlers/http';
import { currentMockUser, findCluster, findCredential, mockDb } from '../db';
import { problem } from '../problem';
import { apiServer } from './apiServer';

/**
 * The mock of FleetConsole's Kubernetes proxy, `ANY /api/clusters/{cluster}/k8s/{path}` (CP2 contract §1–4, T-0070).
 * Registered after `accessGuard` (which already answered CSRF → 401) and before `unhandledApiRoute`. It applies the
 * proxy's remaining checks in contract order — 400 path → 404 not available → 403 user read-only → 403 grant
 * read-only → 413 — then plays the cluster: 502 `Proxy.CredentialRejected` for an expired credential (the upstream
 * 401), otherwise the mock API server.
 */

const PROXY_PATH = /^\/api\/clusters\/([^/]+)\/k8s(\/.*)?$/;
const ALLOWED_PREFIXES = ['/api', '/apis', '/version', '/openapi', '/.well-known'];
/** Encoded separators, dot segments, empty segments and backslashes are rejected before routing (contract §1). */
const FORBIDDEN_PATH = /%2f|%2e|%5c|\.\.|\/\/|\\/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MUTATING_SUBRESOURCES = new Set(['exec', 'attach', 'portforward', 'proxy']);
const ACCESS_REVIEWS =
  /^\/apis\/authorization\.k8s\.io\/v1\/(selfsubjectaccessreviews|selfsubjectrulesreviews)$/;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** A proxied mutation that reached the cluster; the input of proxy audit. */
export interface ProxyMutation {
  cluster: string;
  method: string;
  path: string;
  status: number;
}

/**
 * Hook point for proxy audit entries: called once per mutation the cluster answered, whatever the outcome. Empty for
 * now; T-0079 records audit entries here once the generated audit enum has the `proxy` category.
 */
export const proxyMutationListeners = new Set<(mutation: ProxyMutation) => void>();

function onProxyMutation(mutation: ProxyMutation): void {
  for (const listener of proxyMutationListeners) listener(mutation);
}

function isAllowedPath(path: string): boolean {
  return (
    !FORBIDDEN_PATH.test(path) &&
    ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
}

/** The subresource segment of a resource URL (`…/pods/web-1/exec` → `exec`), if any. */
function subresourceOf(segments: string[]): string | undefined {
  const rest = segments.slice(segments[0] === 'api' ? 2 : 3);
  // namespaces/<ns>/<plural>/<name>/<sub> or <plural>/<name>/<sub>
  if (rest[0] === 'namespaces') return rest.length >= 5 ? rest[4] : undefined;
  return rest[2];
}

/** Mutation as the proxy defines it (contract §4): not GET/HEAD/OPTIONS, or exec-like subresources; SSAR/SSRR excepted. */
function isMutation(method: string, path: string): boolean {
  if (method === 'POST' && ACCESS_REVIEWS.test(path)) return false;
  if (!SAFE_METHODS.has(method)) return true;
  const subresource = subresourceOf(path.split('/').filter((segment) => segment !== ''));
  return subresource !== undefined && MUTATING_SUBRESOURCES.has(subresource);
}

/** The single route of the mock proxy. */
export const k8sProxyHandler = http.untyped.all('*/api/clusters/:cluster/k8s/*', async ({ request }) => {
  const url = new URL(request.url);
  const match = PROXY_PATH.exec(url.pathname);
  const user = currentMockUser();
  if (!match || !user) return undefined; // Not a proxy URL / no session: the guards answer.

  const clusterName = decodeURIComponent(match[1] ?? '');
  const rawPath = match[2] ?? '';
  const method = request.method.toUpperCase();

  if (!isAllowedPath(rawPath)) {
    return problem(400, {
      code: 'Proxy.PathNotAllowed',
      detail: 'This Kubernetes API path is not allowed through the console.',
    });
  }

  const cluster = findCluster(clusterName);
  const grant = cluster?.isEnabled
    ? mockDb.grants.find(
        (candidate) => candidate.username === user.username && candidate.clusterName === clusterName,
      )
    : undefined;
  const credential = grant && findCredential(grant.credentialId, clusterName);
  if (!grant || !credential) {
    return problem(404, {
      code: 'Proxy.NotAvailable',
      detail: `Cluster ${clusterName} is not available — it does not exist or you don't have access.`,
    });
  }

  const path = rawPath.split('/').map(decodeURIComponent).join('/');
  const mutation = isMutation(method, path);
  if (mutation && user.isReadOnly) {
    return problem(403, { code: 'Proxy.UserReadOnly', detail: 'Your account is read-only.' });
  }
  if (mutation && grant.accessMode === 'readOnly') {
    return problem(403, {
      code: 'Proxy.ReadOnlyGrant',
      detail: `Your access to ${clusterName} is read-only.`,
    });
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) {
    return problem(413, {
      code: 'Proxy.BodyTooLarge',
      title: 'Content Too Large',
      detail: 'The request body is larger than the 10 MiB limit.',
    });
  }

  // The cluster answers 401 to an expired token; the proxy turns that into 502 (never a logout, PRX-5).
  if (credential.expiresAt !== null && Date.parse(credential.expiresAt) < Date.now()) {
    return problem(502, {
      code: 'Proxy.CredentialRejected',
      title: 'Bad Gateway',
      detail:
        `The cluster rejected the credential assigned to you for ${clusterName}. ` +
        'Ask a Fleet administrator to rotate it.',
    });
  }

  const response = await apiServer({
    cluster: clusterName,
    credential,
    request,
    path,
    query: url.searchParams,
  });
  if (mutation) onProxyMutation({ cluster: clusterName, method, path, status: response.status });
  return response;
});
