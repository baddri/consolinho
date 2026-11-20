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

/** Whether `profile` may `verb` on `resource` (plural). */
export function isAllowed(profile: RbacProfile, verb: string, resource: string): boolean {
  if (READ_VERBS.has(verb) || profile === 'admin') return true;
  return profile === 'edit' && !CLUSTER_SCOPED.has(resource);
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
