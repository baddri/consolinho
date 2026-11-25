import type { MockCredential } from '../fixtures';

/**
 * RBAC of the mock clusters (T-0070). The cluster authorizes the grant's ServiceAccount token, so the profile is
 * derived from the credential's name: `*admin*` → cluster-admin, `*edit*` → edit on namespaced kinds (namespaces and
 * projects stay read-only), anything else (`*view*`, `legacy*`) → get/list/watch only.
 */
export type RbacProfile = 'view' | 'edit' | 'admin';

const READ_VERBS = new Set(['get', 'list', 'watch']);

/** Cluster-scoped resources `edit` may only read. */
const CLUSTER_SCOPED = new Set(['namespaces', 'projects']);

/** The profile the cluster grants `credential`'s ServiceAccount. */
export function profileOf(credential: MockCredential): RbacProfile {
  if (credential.name.includes('admin')) return 'admin';
  if (credential.name.includes('edit')) return 'edit';
  return 'view';
}

/**
 * Whether `profile` may `verb` on `resource` — a plural, or `plural/subresource` as RBAC names it. A subresource
 * follows its resource: reading it (`get pods/log`, `get deployments/scale`) is allowed to every profile, writing it
 * (`patch deployments/scale`, `create pods/exec`) only where the resource itself is writable, so `view` may neither
 * patch nor write any subresource.
 */
export function isAllowed(profile: RbacProfile, verb: string, resource: string): boolean {
  if (READ_VERBS.has(verb) || profile === 'admin') return true;
  const [plural = ''] = resource.split('/');
  return profile === 'edit' && !CLUSTER_SCOPED.has(plural);
}

/**
 * Clusters whose `view` ServiceAccount may not even read some resources (T-0331 scenarios, mirroring the MSW fleet
 * table): on `prod-us-1` ClusterOperators are forbidden, so Cluster Settings shows its no-access state.
 */
const VIEW_DENIED: Readonly<Record<string, ReadonlySet<string>>> = {
  'prod-us-1': new Set(['clusteroperators']),
};

/** {@link isAllowed} for `credential`'s profile, plus the per-cluster read denials of {@link VIEW_DENIED}. */
export function credentialAllows(credential: MockCredential, verb: string, resource: string): boolean {
  const profile = profileOf(credential);
  const [plural = ''] = resource.split('/');
  if (profile === 'view' && VIEW_DENIED[credential.clusterName]?.has(plural)) return false;
  return isAllowed(profile, verb, resource);
}

/** The RBAC resource name of `plural` with an optional subresource, e.g. `deployments/scale`. */
export function rbacResource(plural: string, subresource: string | undefined): string {
  return subresource ? `${plural}/${subresource}` : plural;
}

/** The ServiceAccount user name the cluster sees, for apiserver-style denial messages. */
export function subjectOf(credential: MockCredential): string {
  return credential.subject ?? `system:serviceaccount:fleetconsole:${credential.name}`;
}

/** Message of a 403 `Forbidden` Status, worded like the API server's. */
export function forbiddenMessage(
  credential: MockCredential,
  verb: string,
  resource: string,
  group: string,
  namespace: string | undefined,
  name: string | undefined,
): string {
  const target = name === undefined ? resource : `${resource}${group ? `.${group}` : ''} "${name}"`;
  const scope = namespace === undefined ? 'at the cluster scope' : `in the namespace "${namespace}"`;
  return (
    `${target} is forbidden: User "${subjectOf(credential)}" cannot ${verb} resource "${resource}" ` +
    `in API group "${group}" ${scope}`
  );
}
