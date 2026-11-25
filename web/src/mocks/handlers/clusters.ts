import type { AccessibleCluster } from '@/shared/api';
import { currentMockUser, findCredential, mockDb } from '../db';
import type { MockUser } from '../fixtures';
import { resolveAccess } from './access';
import { http } from './http';
import { compareEnvironment, ordinal, toAccessibleCluster } from './representations';

/**
 * `GET /api/clusters` (contract §6, SW-1): enabled clusters the signed-in user can open — by a direct grant or a group
 * grant, resolved by {@link resolveAccess} like Effective access (PREC-8, EFF-3); admins see only their own access
 * (GRANT-6) — with the effective access mode and the winning credential's fallback namespaces (NSA-3), sorted by environment then name.
 */
export const clusterSwitcherHandlers = [
  http.get('/api/clusters', ({ response }) => {
    const user = currentMockUser();
    if (!user) return undefined;
    return response(200).json(accessibleClustersOf(user));
  }),
];

/** The clusters `user` can open, as `GET /api/clusters` lists them; the fleet status stream (T-0341) covers the same set. */
export function accessibleClustersOf(user: MockUser): AccessibleCluster[] {
  return mockDb.clusters
    .flatMap((cluster) => {
      const access = resolveAccess(user, cluster.name);
      if (!access) return [];
      // NSA-3: the inspect namespaces of the credential behind the winning grant, like the server.
      const fallback = findCredential(access.winner.credentialId, cluster.name)?.inspectNamespaces ?? [];
      return [toAccessibleCluster(cluster, access.accessMode, fallback)];
    })
    .sort((a, b) => compareEnvironment(a.environment, b.environment) || ordinal(a.name, b.name));
}
