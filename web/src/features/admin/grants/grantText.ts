import type { AccessMode, ClusterEnvironment, Grant } from '@/shared/api';

/** Display names of the access modes (table labels, radios). */
export const ACCESS_MODE_TEXT: Record<AccessMode, string> = { readOnly: 'Read only', readWrite: 'Read write' };

/** Access mode names in toasts, as the spec writes them ("Granted alice ReadOnly on prod-eu-1"). */
const ACCESS_MODE_TOAST: Record<AccessMode, string> = { readOnly: 'ReadOnly', readWrite: 'ReadWrite' };

/** Environment names in sentences ("… prod-eu-1 (production)?"). */
export const ENVIRONMENT_TEXT: Record<ClusterEnvironment, string> = {
  production: 'production',
  staging: 'staging',
  development: 'development',
};

/** Toast title after a grant was created. */
export const grantedText = (grant: Pick<Grant, 'username' | 'clusterName' | 'accessMode'>) =>
  `Granted ${grant.username} ${ACCESS_MODE_TOAST[grant.accessMode]} on ${grant.clusterName}`;

/** Toast title after a grant was changed. */
export const changedText = (grant: Pick<Grant, 'username' | 'clusterName'>) =>
  `Changed ${grant.username}'s access to ${grant.clusterName}`;

/** Toast title after a grant was revoked. */
export const revokedText = (grant: Pick<Grant, 'username' | 'clusterName'>) =>
  `Revoked ${grant.username}'s access to ${grant.clusterName}`;

/** GRANT-2 warning shown while read-write access to a production cluster is selected. */
export const productionWriteWarning = (clusterName: string) =>
  `This user will be able to change production cluster ${clusterName}.`;

/** Warning toast title when the grant turned out to be revoked meanwhile (404 on change or revoke). */
export const alreadyRevokedText = (grant: Pick<Grant, 'username' | 'clusterName'>) =>
  `${grant.username}'s access to ${grant.clusterName} was already revoked`;
