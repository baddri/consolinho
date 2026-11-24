import type { schemas } from './schema';

// Named aliases for the generated API schemas (ADR-0016). Features import these, never `schemas[...]` directly.

// ---- Errors (contract §1)
/** RFC 9457 error body (generated type; `code`/`traceId` are read by `ApiError`). */
export type ProblemDetails = schemas['ProblemDetails'];
/** RFC 9457 400 body with field `errors`. */
export type HttpValidationProblemDetails = schemas['HttpValidationProblemDetails'];

// ---- System (§5)
/** Build/runtime information about the FleetConsole deployment. */
export type SystemInfo = schemas['SystemInfo'];

// ---- Enums (§3)
/** FleetConsole role of a user. */
export type UserRole = schemas['UserRole'];
/** `pending` = never logged in and not deactivated. */
export type UserStatus = schemas['UserStatus'];
/** What kind of configuration makes a user an administrator: the bootstrap user list or an admin group (POL-4). */
export type AdminConfigurationSourceKind = schemas['AdminConfigurationSourceKind'];
/** Why configuration makes a user an administrator; `group` is set iff `kind` is `group` (POL-4). */
export type AdminConfigurationSource = schemas['AdminConfigurationSource'];
/** Fixed environment set; sort order production, staging, development. */
export type ClusterEnvironment = schemas['ClusterEnvironment'];
/** How the Api verifies a cluster's TLS certificate (derived from CA bundle / skip flag). */
export type ClusterTlsMode = schemas['ClusterTlsMode'];
/** Access a grant gives on a cluster. */
export type AccessMode = schemas['AccessMode'];
/** `opaque` tokens get a UI warning (Q10). */
export type TokenType = schemas['TokenType'];
/** Credential token expiry; worst-first order expired > expiringSoon > unknown > noExpiry > ok. */
export type CredentialExpiryStatus = schemas['CredentialExpiryStatus'];
/**
 * Declared cluster distribution (CP3.7 DIST-1, ADR-0032): presentation only (OCP/K8s tag, theme); feature availability
 * still comes from API discovery.
 */
export type ClusterDistribution = schemas['ClusterDistribution'];
/** CA certificate expiry (30-day window, CLU-2). */
export type CertificateExpiryStatus = schemas['CertificateExpiryStatus'];
/** Connection test steps, in execution order. */
export type ConnectionTestStep = schemas['ConnectionTestStep'];
/** Outcome of one connection test step. */
export type ConnectionTestStepStatus = schemas['ConnectionTestStepStatus'];
/** Why a connection test step failed. */
export type ProbeFailureKind = schemas['ProbeFailureKind'];
/** Headline capability of a credential (TEST-3). */
export type CapabilityLevel = schemas['CapabilityLevel'];
/** Whether a capability check reads or writes. */
export type CapabilityCategory = schemas['CapabilityCategory'];
/** Severity of a connection test hint. */
export type HintSeverity = schemas['HintSeverity'];
/** How the connection test determined the credential's identity. */
export type IdentitySource = schemas['IdentitySource'];
/** Audit filter category; maps 1:1 to the action prefix. */
export type AuditCategory = schemas['AuditCategory'];
/** Kind of object an audit entry is about. */
export type AuditTargetType = schemas['AuditTargetType'];

// ---- Session and switcher (§4.4, §6)
/** The signed-in user (`GET /api/auth/me`), the only source of identity, role and read-only state. */
export type CurrentUser = schemas['CurrentUser'];
/** A cluster in the switcher, with the user's effective access mode. */
export type AccessibleCluster = schemas['AccessibleCluster'];

// ---- Users (§7)
/** Row of the admin users list. */
export type UserListItem = schemas['UserListItem'];
/** Full user representation returned by user reads and commands. */
export type UserDetail = schemas['UserDetail'];
/** Body of `POST /api/admin/users`. */
export type CreateUserRequest = schemas['CreateUserRequest'];
/** Body of `PUT /api/admin/users/{username}/role`. */
export type ChangeUserRoleRequest = schemas['ChangeUserRoleRequest'];
/** Body of `PUT /api/admin/users/{username}/read-only`. */
export type SetUserReadOnlyRequest = schemas['SetUserReadOnlyRequest'];
/** Body of every body-less transition (deactivate, enable, …). */
export type VersionRequest = schemas['VersionRequest'];

// ---- Clusters (§8.1, §8.2)
/** Row of the admin clusters list. */
export type ClusterListItem = schemas['ClusterListItem'];
/** Full cluster representation. */
export type ClusterDetail = schemas['ClusterDetail'];
/** A certificate parsed from a cluster's CA bundle. */
export type CaCertificate = schemas['CaCertificate'];
/** Body of `POST /api/admin/clusters`. */
export type RegisterClusterRequest = schemas['RegisterClusterRequest'];
/** Body of `PUT /api/admin/clusters/{name}` (full replacement of editable fields). */
export type UpdateClusterRequest = schemas['UpdateClusterRequest'];

// ---- Credentials and connection test (§8.3–§8.5)
/** A ServiceAccount credential of a cluster (never contains the token). */
export type Credential = schemas['Credential'];
/** Body of `POST /api/admin/clusters/{name}/credentials`. */
export type AddCredentialRequest = schemas['AddCredentialRequest'];
/** Body of the rotate-token endpoint. */
export type RotateCredentialTokenRequest = schemas['RotateCredentialTokenRequest'];
/** Body of the stored-credential test endpoint. */
export type TestCredentialRequest = schemas['TestCredentialRequest'];
/** Body of `POST /api/admin/clusters/{name}/test-token`. */
export type TestTokenRequest = schemas['TestTokenRequest'];
/** Last stored test result of a credential (TEST-5). */
export type ConnectionTestSummary = schemas['ConnectionTestSummary'];
/** Full result of a connection test. */
export type ConnectionTestResult = schemas['ConnectionTestResult'];
/** Result of one connection test step; `message` is shown verbatim. */
export type ConnectionTestStepResult = schemas['ConnectionTestStepResult'];
/** Who the credential authenticates as. */
export type ClusterIdentity = schemas['ClusterIdentity'];
/** OpenShift version reported by the cluster. */
export type OpenShiftVersion = schemas['OpenShiftVersion'];
/** Headline plus individual capability checks. */
export type CapabilitySummary = schemas['CapabilitySummary'];
/** One capability check (render whatever list the Api returns). */
export type CapabilityCheckResult = schemas['CapabilityCheckResult'];
/** One inspected namespace of a connection test (NST-3): exactly one of `rules` / `error` is non-null. */
export type NamespaceRules = schemas['NamespaceRules'];
/** One RBAC resource rule. */
export type ResourceRule = schemas['ResourceRule'];
/** Advice derived from test result and grants (TEST-4). */
export type ConnectionTestHint = schemas['ConnectionTestHint'];

// ---- Grants (§9)
/** A user's access to one cluster through one credential. */
export type Grant = schemas['Grant'];
/** Body of `POST /api/admin/grants`. */
export type CreateGrantRequest = schemas['CreateGrantRequest'];
/** Body of `PUT /api/admin/grants/{grantId}`. */
export type UpdateGrantRequest = schemas['UpdateGrantRequest'];
/** Body of the all-or-nothing bulk grant endpoint (GRANT-4). */
export type BulkGrantRequest = schemas['BulkGrantRequest'];
/** One cluster of a bulk grant. */
export type BulkGrantItem = schemas['BulkGrantItem'];

// ---- Audit (§10)
/** One page of the audit log; `nextCursor` null = last page. */
export type AuditPage = schemas['AuditPage'];
/** One audit log entry; `details` is free-form JSON. */
export type AuditEntry = schemas['AuditEntry'];
