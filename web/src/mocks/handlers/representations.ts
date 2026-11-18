import type {
  AccessibleCluster,
  CaCertificate,
  ClusterDetail,
  ClusterEnvironment,
  ClusterListItem,
  ClusterTlsMode,
  ConnectionTestSummary,
  Credential,
  CredentialExpiryStatus,
  CurrentUser,
  Grant,
  UserDetail,
  UserListItem,
} from '@/shared/api';
import { findCluster, findCredential, findUser, isAdmin, mockDb } from '../db';
import {
  fingerprintOf,
  ONE_DAY_MS,
  type MockCluster,
  type MockCredential,
  type MockGrant,
  type MockTestRecord,
  type MockUser,
} from '../fixtures';

// Derive contract DTOs from the stored records, the way the Api's query handlers do. Everything computed here
// (role, counts, worst expiry, tls mode, last-test roll-up, `isStale`) therefore stays consistent after mutations.

/** `Credentials:ExpiryWarningDays` (contract §12). */
export const EXPIRY_WARNING_DAYS = 14;

const ENVIRONMENT_ORDER: Record<ClusterEnvironment, number> = { production: 0, staging: 1, development: 2 };

/** Contract sort order of environments: production, staging, development. */
export function compareEnvironment(a: ClusterEnvironment, b: ClusterEnvironment): number {
  return ENVIRONMENT_ORDER[a] - ENVIRONMENT_ORDER[b];
}

/** Ordinal string comparison (the Api sorts with `StringComparer.Ordinal`). */
export function ordinal(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ---- Users

/** Count of grants of `username`. */
function grantCountOfUser(username: string): number {
  return mockDb.grants.filter((grant) => grant.username === username).length;
}

/** `GET /api/auth/me` body. */
export function toCurrentUser(user: MockUser): CurrentUser {
  return {
    username: user.username,
    displayName: user.displayName,
    role: isAdmin(user) ? 'admin' : 'user',
    isReadOnly: user.isReadOnly,
    groups: user.groups,
    isAdminViaConfiguration: user.adminConfigurationSource !== null,
    adminConfigurationSource: user.adminConfigurationSource,
  };
}

/** Row of `GET /api/admin/users`. */
export function toUserListItem(user: MockUser): UserListItem {
  return {
    username: user.username,
    displayName: user.displayName,
    role: isAdmin(user) ? 'admin' : 'user',
    isAdminViaConfiguration: user.adminConfigurationSource !== null,
    isAdminByAssignment: user.isAdminByAssignment,
    adminConfigurationSource: user.adminConfigurationSource,
    status: user.status,
    isReadOnly: user.isReadOnly,
    grantCount: grantCountOfUser(user.username),
    lastLoginAt: user.lastLoginAt,
    groups: user.groups,
    version: user.version,
  };
}

/** Full user representation. */
export function toUserDetail(user: MockUser): UserDetail {
  return { ...toUserListItem(user), createdAt: user.createdAt, createdBy: user.createdBy };
}

// ---- Credentials

/** Expiry status at request time: opaque → `unknown`, no `exp` → `noExpiry`, within the warning window → soon. */
export function expiryStatusOf(credential: MockCredential): CredentialExpiryStatus {
  if (credential.tokenType === 'opaque') return 'unknown';
  if (credential.expiresAt === null) return 'noExpiry';
  const remaining = Date.parse(credential.expiresAt) - Date.now();
  if (remaining <= 0) return 'expired';
  return remaining <= EXPIRY_WARNING_DAYS * ONE_DAY_MS ? 'expiringSoon' : 'ok';
}

const EXPIRY_SEVERITY: Record<CredentialExpiryStatus, number> = {
  expired: 4,
  expiringSoon: 3,
  unknown: 2,
  noExpiry: 1,
  ok: 0,
};

/** Stored test → summary; stale when the cluster's connection settings changed after the test (CLU-4). */
export function toTestSummary(
  test: MockTestRecord | null,
  clusterName: string,
): ConnectionTestSummary | null {
  if (test === null) return null;
  const cluster = findCluster(clusterName);
  const isStale =
    cluster !== undefined && Date.parse(test.testedAt) < Date.parse(cluster.connectionSettingsChangedAt);
  return { ...test, isStale };
}

/** Credential representation (§8.3). */
export function toCredential(credential: MockCredential): Credential {
  const cluster = findCluster(credential.clusterName);
  const grants = mockDb.grants.filter((grant) => grant.credentialId === credential.id);
  return {
    id: credential.id,
    clusterName: credential.clusterName,
    clusterDisplayName: cluster?.displayName ?? credential.clusterName,
    clusterEnvironment: cluster?.environment ?? 'development',
    clusterIsEnabled: cluster?.isEnabled ?? false,
    name: credential.name,
    description: credential.description,
    fingerprint: credential.fingerprint,
    tokenType: credential.tokenType,
    serviceAccount: credential.serviceAccount,
    subject: credential.subject,
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
    expiryStatus: expiryStatusOf(credential),
    expiryWarningDays: EXPIRY_WARNING_DAYS,
    createdAt: credential.createdAt,
    createdBy: credential.createdBy,
    rotatedAt: credential.rotatedAt,
    rotatedBy: credential.rotatedBy,
    lastTest: toTestSummary(credential.lastTest, credential.clusterName),
    grantCount: grants.length,
    readWriteGrantCount: grants.filter((grant) => grant.accessMode === 'readWrite').length,
    version: credential.version,
  };
}

// ---- Clusters

/** `skipVerify` when skipping, `caBundle` when a bundle is set, else `systemTrust`. */
export function tlsModeOf(cluster: MockCluster): ClusterTlsMode {
  if (cluster.skipTlsVerify) return 'skipVerify';
  return cluster.caBundle === null ? 'systemTrust' : 'caBundle';
}

/** Number of PEM certificate blocks in a bundle (the mock's stand-in for X.509 parsing). */
export function countPemCertificates(bundle: string): number {
  return bundle.split('-----BEGIN CERTIFICATE-----').length - 1;
}

/** Uppercase, colon-separated, SHA-256-shaped fingerprint derived from `seed`. */
function fakeSha256(seed: string): string {
  const hex = Array.from({ length: 8 }, (_, i) => fingerprintOf(`${seed}#${i}`)).join('');
  return (hex.toUpperCase().match(/../g) ?? []).join(':');
}

/** One canned certificate per PEM block, valid for ten years from the cluster's creation. */
function caCertificatesOf(cluster: MockCluster): CaCertificate[] {
  if (cluster.caBundle === null) return [];
  return Array.from({ length: countPemCertificates(cluster.caBundle) }, (_, index) => ({
    subject: `CN=${cluster.name}-ingress-ca-${index + 1}`,
    issuer: `CN=${cluster.name}-root-ca`,
    notBefore: cluster.createdAt,
    notAfter: new Date(Date.parse(cluster.createdAt) + 3650 * ONE_DAY_MS).toISOString(),
    expiryStatus: 'ok' as const,
    sha256Fingerprint: fakeSha256(`${cluster.name}/${index}`),
  }));
}

/** Credentials of a cluster, sorted by name. */
export function credentialsOfCluster(clusterName: string): MockCredential[] {
  return mockDb.credentials
    .filter((credential) => credential.clusterName === clusterName)
    .sort((a, b) => ordinal(a.name, b.name));
}

/** Row of `GET /api/admin/clusters`: counts, worst credential expiry and newest test across its credentials. */
export function toClusterListItem(cluster: MockCluster): ClusterListItem {
  const credentials = credentialsOfCluster(cluster.name);
  const worst = credentials
    .map(expiryStatusOf)
    .reduce<CredentialExpiryStatus | null>(
      (acc, status) => (acc === null || EXPIRY_SEVERITY[status] > EXPIRY_SEVERITY[acc] ? status : acc),
      null,
    );
  const newest = credentials
    .filter(
      (credential): credential is MockCredential & { lastTest: MockTestRecord } =>
        credential.lastTest !== null,
    )
    .sort((a, b) => Date.parse(b.lastTest.testedAt) - Date.parse(a.lastTest.testedAt))[0];
  return {
    name: cluster.name,
    displayName: cluster.displayName,
    environment: cluster.environment,
    apiUrl: cluster.apiUrl,
    isEnabled: cluster.isEnabled,
    tlsMode: tlsModeOf(cluster),
    credentialCount: credentials.length,
    worstCredentialExpiryStatus: worst,
    grantCount: mockDb.grants.filter((grant) => grant.clusterName === cluster.name).length,
    lastTest: newest ? toTestSummary(newest.lastTest, cluster.name) : null,
    lastTestCredentialName: newest?.name ?? null,
    version: cluster.version,
  };
}

/** Full cluster representation (§8.1). */
export function toClusterDetail(cluster: MockCluster): ClusterDetail {
  return {
    name: cluster.name,
    displayName: cluster.displayName,
    environment: cluster.environment,
    apiUrl: cluster.apiUrl,
    webConsoleUrl: cluster.webConsoleUrl,
    description: cluster.description,
    caBundle: cluster.caBundle,
    caCertificates: caCertificatesOf(cluster),
    skipTlsVerify: cluster.skipTlsVerify,
    tlsMode: tlsModeOf(cluster),
    isEnabled: cluster.isEnabled,
    credentialCount: credentialsOfCluster(cluster.name).length,
    grantCount: mockDb.grants.filter((grant) => grant.clusterName === cluster.name).length,
    connectionSettingsChangedAt: cluster.connectionSettingsChangedAt,
    createdAt: cluster.createdAt,
    createdBy: cluster.createdBy,
    updatedAt: cluster.updatedAt,
    updatedBy: cluster.updatedBy,
    version: cluster.version,
  };
}

/** Switcher entry with the effective access mode (readOnly when the grant or the user is read-only, §6). */
export function toAccessibleCluster(
  cluster: MockCluster,
  grant: MockGrant,
  user: MockUser,
): AccessibleCluster {
  return {
    name: cluster.name,
    displayName: cluster.displayName,
    environment: cluster.environment,
    accessMode: user.isReadOnly ? 'readOnly' : grant.accessMode,
    webConsoleUrl: cluster.webConsoleUrl,
  };
}

// ---- Grants

/** Grant representation (§9.1) with the GRANT-5 marker fields. */
export function toGrant(grant: MockGrant): Grant {
  const user = findUser(grant.username);
  const cluster = findCluster(grant.clusterName);
  const credential = findCredential(grant.credentialId);
  return {
    id: grant.id,
    username: grant.username,
    userDisplayName: user?.displayName ?? null,
    userStatus: user?.status ?? 'deactivated',
    clusterName: grant.clusterName,
    clusterDisplayName: cluster?.displayName ?? grant.clusterName,
    clusterEnvironment: cluster?.environment ?? 'development',
    clusterIsEnabled: cluster?.isEnabled ?? false,
    credentialId: grant.credentialId,
    credentialName: credential?.name ?? '(deleted)',
    credentialExpiryStatus: credential ? expiryStatusOf(credential) : 'unknown',
    credentialExpiresAt: credential?.expiresAt ?? null,
    credentialLastTest: credential ? toTestSummary(credential.lastTest, credential.clusterName) : null,
    accessMode: grant.accessMode,
    grantedAt: grant.grantedAt,
    grantedBy: grant.grantedBy,
    updatedAt: grant.updatedAt,
    updatedBy: grant.updatedBy,
    version: grant.version,
  };
}

/** Grants ordered for a user's access tab: cluster environment, then cluster name. */
export function sortGrantsByCluster(grants: MockGrant[]): MockGrant[] {
  return grants.sort((a, b) => {
    const envA = findCluster(a.clusterName)?.environment ?? 'development';
    const envB = findCluster(b.clusterName)?.environment ?? 'development';
    return compareEnvironment(envA, envB) || ordinal(a.clusterName, b.clusterName);
  });
}
