import { z } from 'zod';
import type { AuditEntry } from '@/shared/api';
import { K8S_MODELS } from '@/shared/k8s';

/**
 * Sentence-case labels of the audit action ids the backend writes (`FleetConsole.Application`, AUD-2). Proxy
 * actions (Kubernetes mutations) are labelled from their `details` by {@link auditEntryLabel}; any id added later is
 * not listed and falls back to the raw id.
 */
const AUDIT_ACTION_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'auth.login': 'Logged in',
    'auth.login_denied': 'Login denied',
    'auth.logout': 'Logged out',
    'cluster.registered': 'Cluster registered',
    'cluster.updated': 'Cluster updated',
    'cluster.enabled': 'Cluster enabled',
    'cluster.disabled': 'Cluster disabled',
    'cluster.deleted': 'Cluster deleted',
    'credential.added': 'Credential added',
    'credential.rotated': 'Credential rotated',
    'credential.deleted': 'Credential deleted',
    'credential.tested': 'Credential tested',
    'credential.token_tested': 'Token tested',
    'grant.created': 'Access granted',
    'grant.changed': 'Access changed',
    'grant.revoked': 'Access revoked',
    'user.created': 'User added',
    'user.provisioned': 'User provisioned',
    'user.promoted': 'User promoted to admin',
    'user.demoted': 'User demoted to user',
    'user.deactivated': 'User deactivated',
    'user.reactivated': 'User reactivated',
    'user.read_only_changed': 'Read only changed',
  }),
);

/**
 * Human label of an audit action id ("auth.login_denied" → "Login denied"); unknown ids are returned unchanged. A
 * `Map` (not an object lookup) keeps ids like "constructor" from resolving to prototype members.
 */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS.get(action) ?? action;
}

/** Prefix of the action ids of proxied Kubernetes mutations (`proxy.update`, CP2 contract §5). */
const PROXY_ACTION_PREFIX = 'proxy.';

/**
 * The part of a proxy entry's `details` the label needs. The server types `details` as free-form JSON, so it is parsed
 * defensively; extra fields are ignored and a shape this client doesn't know falls back to the raw id.
 */
const proxyTargetSchema = z.object({
  group: z.string().nullish(),
  resource: z.string().min(1),
  subresource: z.string().nullish(),
});

/** The parsed proxy target plus the verb from the action id (`proxy.<verb>`). */
interface ProxyAction {
  verb: string;
  group: string;
  resource: string;
  subresource: string | null;
}

/** One labelling rule: when `matches`, the entry reads `label(kind)`. */
interface ProxyLabelRule {
  matches: (action: ProxyAction) => boolean;
  label: (kind: string) => string;
}

const isSubresource = (group: string, resource: string, subresource: string) => (action: ProxyAction) =>
  action.group === group && action.resource === resource && action.subresource === subresource;

const isVerb = (verb: string) => (action: ProxyAction) => action.verb === verb && action.subresource === null;

/**
 * Proxy action labels, first match wins (POL-3). Subresources with an OCP action of their own read like that action
 * ("Scale Deployment", "Exec into Pod"); everything else is "<verb> <Kind>". Restart/pause/resume are plain patches
 * without a hint, so they read "Patch Deployment" (the body is not inspected).
 */
const PROXY_LABEL_RULES: readonly ProxyLabelRule[] = [
  {
    matches: (a) => a.subresource === 'scale' && (a.verb === 'update' || a.verb === 'patch'),
    label: (kind) => `Scale ${kind}`,
  },
  { matches: isSubresource('', 'pods', 'exec'), label: () => 'Exec into Pod' },
  { matches: isSubresource('', 'pods', 'attach'), label: () => 'Attach to Pod' },
  { matches: isSubresource('', 'pods', 'eviction'), label: () => 'Evict Pod' },
  {
    matches: isSubresource('apps.openshift.io', 'deploymentconfigs', 'instantiate'),
    label: () => 'Start rollout of DeploymentConfig',
  },
  {
    matches: isSubresource('apps.openshift.io', 'deploymentconfigs', 'rollback'),
    label: () => 'Roll back DeploymentConfig',
  },
  { matches: (a) => a.subresource === 'status', label: (kind) => `Update ${kind} status` },
  { matches: isVerb('create'), label: (kind) => `Create ${kind}` },
  { matches: isVerb('update'), label: (kind) => `Update ${kind}` },
  { matches: isVerb('patch'), label: (kind) => `Patch ${kind}` },
  { matches: isVerb('delete'), label: (kind) => `Delete ${kind}` },
  { matches: isVerb('delete_collection'), label: (kind) => `Delete ${kind} collection` },
  { matches: (a) => a.verb === 'connect', label: (kind) => `Connect to ${kind}` },
];

/** Sentence-cased singular of an unknown plural (`widgets` → "Widget", `policies` → "Policy"). */
function singularLabel(plural: string): string {
  const singular = plural.endsWith('ies')
    ? `${plural.slice(0, -3)}y`
    : plural.endsWith('s')
      ? plural.slice(0, -1)
      : plural;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/** Kind of the resource `plural` in `group` from the shared model registry, else a readable guess from the plural. */
function kindForResource(group: string, plural: string): string {
  return K8S_MODELS.find((model) => model.group === group && model.plural === plural)?.kind ?? singularLabel(plural);
}

/** Readable label of a proxy entry, or `undefined` when its `details` don't parse or no rule matches. */
function proxyActionLabel(verb: string, details: unknown): string | undefined {
  const parsed = proxyTargetSchema.safeParse(details);
  if (!parsed.success) return undefined;
  const action: ProxyAction = {
    verb,
    group: parsed.data.group ?? '',
    resource: parsed.data.resource,
    subresource: parsed.data.subresource ?? null,
  };
  const rule = PROXY_LABEL_RULES.find((candidate) => candidate.matches(action));
  return rule?.label(kindForResource(action.group, action.resource));
}

/**
 * Human label of an audit entry: proxied Kubernetes mutations from their target (`proxy.patch` on
 * `deployments/scale` → "Scale Deployment", POL-3), every other action via {@link auditActionLabel}. Falls back to
 * the raw action id when the proxy `details` are missing or malformed.
 */
export function auditEntryLabel(entry: Pick<AuditEntry, 'action' | 'details'>): string {
  if (!entry.action.startsWith(PROXY_ACTION_PREFIX)) return auditActionLabel(entry.action);
  return proxyActionLabel(entry.action.slice(PROXY_ACTION_PREFIX.length), entry.details) ?? entry.action;
}
