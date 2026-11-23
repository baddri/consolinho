import type { AuditInput } from '../db';

/**
 * Proxy audit entries of the mock (CP2 contract §5, PAUD-4): the same action, kubectl-style target name, summary and
 * `details` shape the Api records for a proxied mutation. Pure — the proxy handler records the result with
 * `recordAudit`, and the audit fixtures reuse it so fixture and live entries cannot drift apart.
 */

/** Why the proxy refused a mutation (`details.reason`). */
export type ProxyDenialReason = 'noAccess' | 'userReadOnly' | 'readOnlyGrant' | 'bodyTooLarge';

/** A proxied mutation and how it ended; the input of proxy audit. */
export interface ProxyMutation {
  cluster: string;
  method: string;
  /** Decoded Kubernetes API path below the proxy prefix, e.g. `/api/v1/namespaces/shop/configmaps/web`. */
  path: string;
  /** The cluster's status for allowed requests (401 even if the browser got 502); the problem's status for denials. */
  status: number;
  /** `null` when the request was forwarded. */
  reason: ProxyDenialReason | null;
}

type ProxyVerb = 'create' | 'update' | 'patch' | 'delete' | 'delete_collection' | 'connect' | 'other';

/** Summary wording per verb: past tense for allowed entries, infinitive for "tried to …" denials. */
const VERB_TEXT: Record<ProxyVerb, { past: string; infinitive: string }> = {
  create: { past: 'created', infinitive: 'create' },
  update: { past: 'updated', infinitive: 'update' },
  patch: { past: 'patched', infinitive: 'patch' },
  delete: { past: 'deleted', infinitive: 'delete' },
  delete_collection: { past: 'deleted the collection', infinitive: 'delete the collection' },
  connect: { past: 'connected to', infinitive: 'connect to' },
  other: { past: 'sent a request to', infinitive: 'send a request to' },
};

const REASON_TEXT: Record<ProxyDenialReason, string> = {
  noAccess: 'no access',
  userReadOnly: 'read-only user',
  readOnlyGrant: 'read-only grant',
  bodyTooLarge: 'body too large',
};

const CONNECT_SUBRESOURCES = new Set(['exec', 'attach', 'portforward', 'proxy']);

/** The resource a Kubernetes API path addresses. */
interface ProxyTarget {
  group: string;
  version: string;
  resource: string;
  subresource: string | null;
  namespace: string | null;
  name: string | null;
}

/** Parses `/api/v1/…` and `/apis/<group>/<version>/…`; `undefined` for non-resource paths (`/version`, discovery). */
function parseTarget(path: string): ProxyTarget | undefined {
  const segments = path.split('/').filter((segment) => segment !== '');
  const core = segments[0] === 'api';
  if (!core && segments[0] !== 'apis') return undefined;
  const group = core ? '' : (segments[1] ?? '');
  const version = core ? segments[1] : segments[2];
  const rest = segments.slice(core ? 2 : 3);
  const namespaced = rest[0] === 'namespaces' && rest.length >= 3;
  const [resource, name, ...subresource] = namespaced ? rest.slice(2) : rest;
  if (!version || !resource) return undefined;
  return {
    group,
    version,
    resource,
    subresource: subresource.length > 0 ? subresource.join('/') : null,
    namespace: namespaced ? (rest[1] ?? null) : null,
    name: name ?? null,
  };
}

function verbOf(method: string, target: ProxyTarget | undefined): ProxyVerb {
  const subresource = target?.subresource?.split('/')[0];
  if (subresource && CONNECT_SUBRESOURCES.has(subresource)) return 'connect';
  switch (method) {
    case 'POST':
      return 'create';
    case 'PUT':
      return 'update';
    case 'PATCH':
      return 'patch';
    case 'DELETE':
      return target?.name ? 'delete' : 'delete_collection';
    default:
      return 'other';
  }
}

/** kubectl-style name: `shop/configmaps/web`, `shop/deployments.apps/web/scale`, `namespaces/shop`, `shop/pods`. */
function targetNameOf(target: ProxyTarget | undefined, path: string): string {
  if (!target) return path;
  const resource = target.group ? `${target.resource}.${target.group}` : target.resource;
  return [target.namespace, resource, target.name, target.subresource]
    .filter((part) => part !== null)
    .join('/');
}

/** The audit entry (minus id/time/actor) of `mutation` performed by `actor`. */
export function proxyAuditInput(
  actor: string,
  mutation: ProxyMutation,
): AuditInput & { details: Record<string, unknown> } {
  const target = parseTarget(mutation.path);
  const verb = verbOf(mutation.method, target);
  const targetName = targetNameOf(target, mutation.path);
  const summary =
    mutation.reason === null
      ? `${actor} ${VERB_TEXT[verb].past} ${targetName} on ${mutation.cluster} (${mutation.status})`
      : `Denied: ${actor} tried to ${VERB_TEXT[verb].infinitive} ${targetName} on ${mutation.cluster} ` +
        `(${REASON_TEXT[mutation.reason]})`;
  return {
    action: `proxy.${verb}`,
    category: 'proxy',
    targetType: 'kubernetesResource',
    targetId: null,
    targetName,
    clusterName: mutation.cluster,
    summary,
    details: {
      method: mutation.method,
      path: mutation.path,
      group: target?.group ?? null,
      version: target?.version ?? null,
      resource: target?.resource ?? null,
      subresource: target?.subresource ?? null,
      namespace: target?.namespace ?? null,
      name: target?.name ?? null,
      dryRun: null,
      fieldManager: null,
      container: null,
      statusCode: mutation.status,
      outcome: mutation.reason === null ? 'allowed' : 'denied',
      reason: mutation.reason,
    },
  };
}
