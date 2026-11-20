import { currentMockUser, findCluster, mockDb } from '../db';
import { http } from './http';
import { compareEnvironment, ordinal, toAccessibleCluster } from './representations';

/**
 * `GET /api/clusters` (contract §6, SW-1): enabled clusters the signed-in user holds a grant on — admins included,
 * only their own grants (GRANT-6) — with the effective access mode, sorted by environment then name.
 */
export const clusterSwitcherHandlers = [
  http.get('/api/clusters', ({ response }) => {
    const user = currentMockUser();
    if (!user) return undefined;
    const accessible = mockDb.grants
      .filter((grant) => grant.username === user.username)
      .flatMap((grant) => {
        const cluster = findCluster(grant.clusterName);
        return cluster?.isEnabled ? [toAccessibleCluster(cluster, grant, user)] : [];
      })
      .sort((a, b) => compareEnvironment(a.environment, b.environment) || ordinal(a.name, b.name));
    return response(200).json(accessible);
  }),
];
