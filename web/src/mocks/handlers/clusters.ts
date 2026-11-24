import { currentMockUser, mockDb } from '../db';
import { resolveAccess } from './access';
import { http } from './http';
import { compareEnvironment, ordinal, toAccessibleCluster } from './representations';

/**
 * `GET /api/clusters` (contract §6, SW-1): enabled clusters the signed-in user can open — by a direct grant or a group
 * grant, resolved by {@link resolveAccess} like Effective access (PREC-8, EFF-3); admins see only their own access
 * (GRANT-6) — with the effective access mode, sorted by environment then name.
 */
export const clusterSwitcherHandlers = [
  http.get('/api/clusters', ({ response }) => {
    const user = currentMockUser();
    if (!user) return undefined;
    const accessible = mockDb.clusters
      .flatMap((cluster) => {
        const access = resolveAccess(user, cluster.name);
        return access ? [toAccessibleCluster(cluster, access.accessMode)] : [];
      })
      .sort((a, b) => compareEnvironment(a.environment, b.environment) || ordinal(a.name, b.name));
    return response(200).json(accessible);
  }),
];
