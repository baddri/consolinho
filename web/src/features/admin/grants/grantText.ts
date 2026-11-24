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

/** The subject and cluster a toast or title names. */
type GrantSubjectRef = Pick<Grant, 'subjectKind' | 'subjectName' | 'clusterName'>;

/** Toast title after a grant was created; group grants name the group ("Granted group sre ReadOnly on dev-1"). */
export const grantedText = (grant: GrantSubjectRef & Pick<Grant, 'accessMode'>) =>
  `Granted ${grant.subjectKind === 'group' ? 'group ' : ''}${grant.subjectName} ${ACCESS_MODE_TOAST[grant.accessMode]} on ${grant.clusterName}`;

/** Toast title after a grant was changed; group grants use the revoke toast's wording (spec §5). */
export const changedText = (grant: GrantSubjectRef) =>
  grant.subjectKind === 'group'
    ? `Changed access of group ${grant.subjectName} to ${grant.clusterName}`
    : `Changed ${grant.subjectName}'s access to ${grant.clusterName}`;

/** Title of the edit dialog: users keep GRANT-3's wording, groups the spec's "access of group" form. */
export const editTitleText = (grant: GrantSubjectRef) =>
  grant.subjectKind === 'group'
    ? `Edit access of group ${grant.subjectName} to ${grant.clusterName}`
    : `Change ${grant.subjectName}'s access to ${grant.clusterName}`;

/** Toast title after a grant was revoked; group grants name the group (spec §5). */
export const revokedText = (grant: GrantSubjectRef) =>
  grant.subjectKind === 'group'
    ? `Revoked access of group ${grant.subjectName} to ${grant.clusterName}`
    : `Revoked ${grant.subjectName}'s access to ${grant.clusterName}`;

/** GRANT-2 warning shown while read-write access to a production cluster is selected. */
export const productionWriteWarning = (clusterName: string) =>
  `This user will be able to change production cluster ${clusterName}.`;

/** UIG-5: the production read-write warning for a group grant, naming the group once one is entered. */
export const productionGroupWriteWarning = (groupName: string, clusterName: string) =>
  `Members of ${groupName.trim() === '' ? 'this group' : groupName.trim()} will be able to change resources on ${clusterName}.`;

/** UIG-3 helper text of the Priority field (spec copy, verbatim). */
export const PRIORITY_HELPER_TEXT =
  'When a user is in several groups with access to this cluster, the highest priority wins. A direct user grant always wins.';

/** GRP-4 copy: the Api's 409 `Grants.PriorityTaken` detail without its markdown backticks (UX copy style). */
export const priorityTakenText = (priority: number, groupName: string) =>
  `Priority ${priority} is already used by group ${groupName} on this cluster.`;

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
