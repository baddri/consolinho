import { adminClusterHandlers } from './adminClusters';
import { auditHandlers } from './audit';
import { authHandlers } from './auth';
import { clusterSwitcherHandlers } from './clusters';
import { credentialHandlers } from './credentials';
import { grantHandlers } from './grants';
import { accessGuard, unhandledApiRoute } from './http';
import { systemHandlers } from './system';
import { userHandlers } from './users';

/**
 * Every CP1 contract route (ADR-0016), behind {@link accessGuard} (CSRF → 401 → admin 403 → read-only 403), which
 * must stay first, and before {@link unhandledApiRoute}, which must stay last. Used by the Vitest MSW server (`test/server.ts`) and, later, the browser worker (T-0042).
 */
export const handlers = [
  accessGuard,
  ...systemHandlers,
  ...authHandlers,
  ...clusterSwitcherHandlers,
  ...userHandlers,
  ...adminClusterHandlers,
  ...credentialHandlers,
  ...grantHandlers,
  ...auditHandlers,
  unhandledApiRoute,
];

export { http } from './http';
export { encodeAuditCursor } from './audit';
