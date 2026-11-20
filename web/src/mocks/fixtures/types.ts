import type {
  AccessMode,
  CapabilityLevel,
  ClusterEnvironment,
  ConnectionTestStep,
  TokenType,
  UserStatus,
} from '@/shared/api';

// Storage records of the mock backend. They hold the *stored* state, like the backend's aggregates; every derived
// field of the contract DTOs (role, counts, expiry status, tls mode, `isStale`, …) is computed by
// `handlers/representations.ts`, so lists stay consistent after mutations.

/** A FleetConsole user. Effective role = admin when `isAdminByAssignment` or `adminConfigurationSource` is set. */
export interface MockUser {
  username: string;
  displayName: string | null;
  isAdminByAssignment: boolean;
  /** e.g. `group fleetconsole-admins`; `null` when configuration does not make the user admin (ADR-0009). */
  adminConfigurationSource: string | null;
  status: UserStatus;
  isReadOnly: boolean;
  lastLoginAt: string | null;
  groups: string[];
  createdAt: string;
  createdBy: string;
  version: number;
}

/** A registered cluster. `tlsMode` and CA certificate details are derived from `caBundle` / `skipTlsVerify`. */
export interface MockCluster {
  name: string;
  displayName: string;
  environment: ClusterEnvironment;
  apiUrl: string;
  webConsoleUrl: string | null;
  description: string | null;
  caBundle: string | null;
  skipTlsVerify: boolean;
  isEnabled: boolean;
  connectionSettingsChangedAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  version: number;
}

/** Stored outcome of a credential's last connection test; `isStale` is derived from the cluster (CLU-4). */
export interface MockTestRecord {
  testedAt: string;
  succeeded: boolean;
  failedStep: ConnectionTestStep | null;
  headline: CapabilityLevel | null;
}

/**
 * Which canned connection test result `POST …/test` returns for a credential (see `connectionTests.ts`):
 * passing with the given capability headline, or failing at reachability (TLS) / authentication.
 */
export type ConnectionTestScenario = 'view' | 'edit' | 'admin' | 'tlsFailure' | 'authFailure';

/** A ServiceAccount credential. The token is never stored by the mock either — only what the Api derives from it. */
export interface MockCredential {
  id: string;
  clusterName: string;
  name: string;
  description: string | null;
  fingerprint: string;
  tokenType: TokenType;
  serviceAccount: string | null;
  subject: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
  rotatedAt: string | null;
  rotatedBy: string | null;
  lastTest: MockTestRecord | null;
  testScenario: ConnectionTestScenario;
  version: number;
}

/** Access of one user to one cluster through one credential (GRANT-1: at most one per user and cluster). */
export interface MockGrant {
  id: string;
  username: string;
  clusterName: string;
  credentialId: string;
  accessMode: AccessMode;
  grantedAt: string;
  grantedBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  version: number;
}
