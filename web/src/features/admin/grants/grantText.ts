import type { AccessMode, ClusterEnvironment, Grant, GrantSubjectKind } from '@/shared/api';
import type { RadioGroupFieldOption } from '@/shared/forms';
import { PRODUCT_NAME } from '@/shared/branding';

/** Display names of the access modes (table labels, radios). */
export const ACCESS_MODE_TEXT: Record<AccessMode, string> = {
  readOnly: 'Read only',
  readWrite: 'Read write',
};

/** Subject kinds as OCP's RoleBinding list writes them (Subject kind column, filter options). */
export const SUBJECT_KIND_TEXT: Readonly<Record<GrantSubjectKind, string>> = { user: 'User', group: 'Group' };

/** Access mode names in toasts, as the spec writes them ("Granted alice ReadOnly on prod-eu-1"). */
const ACCESS_MODE_TOAST: Record<AccessMode, string> = { readOnly: 'ReadOnly', readWrite: 'ReadWrite' };

/** Environment names in sentences ("… prod-eu-1 (production)?"). */
export const ENVIRONMENT_TEXT: Record<ClusterEnvironment, string> = {
  production: 'production',
  staging: 'staging',
  development: 'development',
};

/** Toast title after a grant was created. */
export const grantedText = (grant: Pick<Grant, 'subjectName' | 'clusterName' | 'accessMode'>) =>
  `Granted ${grant.subjectName} ${ACCESS_MODE_TOAST[grant.accessMode]} on ${grant.clusterName}`;

/** Toast title after a grant was changed. */
export const changedText = (grant: Pick<Grant, 'subjectName' | 'clusterName'>) =>
  `Changed ${grant.subjectName}'s access to ${grant.clusterName}`;

/** The subject and cluster a toast names; without `subjectKind` the subject is a user. */
type GrantSubjectRef = Pick<Grant, 'subjectName' | 'clusterName'> & Partial<Pick<Grant, 'subjectKind'>>;

/** Toast title after a grant was revoked; group grants name the group (spec §5). */
export const revokedText = (grant: GrantSubjectRef) =>
  grant.subjectKind === 'group'
    ? `Revoked access of group ${grant.subjectName} to ${grant.clusterName}`
    : `Revoked ${grant.subjectName}'s access to ${grant.clusterName}`;

/** GRANT-2 warning shown while read-write access to a production cluster is selected. */
export const productionWriteWarning = (clusterName: string) =>
  `This user will be able to change production cluster ${clusterName}.`;

/** Warning toast title when the grant turned out to be revoked meanwhile (404 on change or revoke). */
export const alreadyRevokedText = (grant: GrantSubjectRef) =>
  grant.subjectKind === 'group'
    ? `Access of group ${grant.subjectName} to ${grant.clusterName} was already revoked`
    : `${grant.subjectName}'s access to ${grant.clusterName} was already revoked`;

/** Toast title after a bulk grant (GRANT-4), e.g. "Granted alice ReadOnly on 12 clusters". */
export const bulkGrantedText = (username: string, accessMode: AccessMode, count: number) =>
  `Granted ${username} ${ACCESS_MODE_TOAST[accessMode]} on ${count} ${count === 1 ? 'cluster' : 'clusters'}`;

/** Bulk grant warning while read-write access to production clusters is selected (GRANT-4). */
export const productionClustersWriteWarning = (clusterNames: readonly string[]) =>
  `This user will be able to change production clusters: ${clusterNames.join(', ')}.`;

/** Access mode radios; read only first, the default (GRANT-2). */
export const ACCESS_MODE_OPTIONS: readonly RadioGroupFieldOption[] = [
  {
    value: 'readOnly',
    label: ACCESS_MODE_TEXT.readOnly,
    description: `View resources, logs and events. ${PRODUCT_NAME} blocks every change.`,
  },
  {
    value: 'readWrite',
    label: ACCESS_MODE_TEXT.readWrite,
    description: 'Change resources as far as the credential allows.',
  },
];
