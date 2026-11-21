/**
 * Sentence-case labels of the audit action ids the backend writes (`FleetConsole.Application`, AUD-2). Proxy
 * actions (Kubernetes mutations) and any id added later are not listed and fall back to the raw id.
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
