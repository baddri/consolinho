import type { paths } from '@/shared/api';

/**
 * Filters of one audit log query: the resolved request of `GET /api/admin/audit` without the paging cursor (the cursor
 * is the infinite query's page param, not part of its key).
 */
export type AuditQueryFilters = Omit<
  NonNullable<paths['/api/admin/audit']['get']['parameters']['query']>,
  'cursor'
>;

/**
 * Query key factory of the admin area (FRONTEND.md "Data fetching rules"). Keys mirror the endpoint URLs under the
 * common prefix `['api','admin']`, so a mutation can invalidate everything admin-related with `adminKeys.all`
 * (ADR-0015 §6) while `setQueryData` targets one representation. Never build these keys inline.
 */
export const adminKeys = {
  /** Prefix of every admin query; invalidate it after any admin mutation. */
  all: ['api', 'admin'] as const,
  /** `GET /api/admin/users`. */
  users: () => [...adminKeys.all, 'users'] as const,
  /** `GET /api/admin/users/{username}`. */
  user: (username: string) => [...adminKeys.users(), username] as const,
  /** `GET /api/admin/users/{username}/grants`. */
  userGrants: (username: string) => [...adminKeys.user(username), 'grants'] as const,
  /** `GET /api/admin/clusters`. */
  clusters: () => [...adminKeys.all, 'clusters'] as const,
  /** `GET /api/admin/clusters/{name}`. */
  cluster: (name: string) => [...adminKeys.clusters(), name] as const,
  /** `GET /api/admin/clusters/{name}/credentials`. */
  clusterCredentials: (name: string) => [...adminKeys.cluster(name), 'credentials'] as const,
  /** `GET /api/admin/clusters/{name}/grants`. */
  clusterGrants: (name: string) => [...adminKeys.cluster(name), 'grants'] as const,
  /** `GET /api/admin/credentials` (fleet-wide credentials view). */
  credentials: () => [...adminKeys.all, 'credentials'] as const,
  /** `GET /api/admin/audit` with the resolved `filters` (infinite query, cursor paging). */
  audit: (filters: AuditQueryFilters) => [...adminKeys.all, 'audit', filters] as const,
};
