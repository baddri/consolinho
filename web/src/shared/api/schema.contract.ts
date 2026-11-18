/**
 * Provisional (ADR-0016). Deleted by T-0043. Do not import directly — use `./schema` / `./types`.
 *
 * Hand-written transcription of `docs/specs/CP1-api-contract.md` §3–§10 in openapi-typescript's output format, so it
 * can be merged key-by-key with the generated `schema.gen.ts` (generated wins). Schema names are the C# record names
 * minus `Dto`; enums are string unions named like the C# enum. Nullable fields are present as `null | T`, exactly like
 * the generated file. `/api/auth/login` and `/api/auth/callback` are full-page navigations and deliberately absent.
 *
 * The private helper types below (`JsonResponse`, `ProblemResponse`, …) expand to the same structure openapi-typescript
 * writes out longhand; they only keep this file reviewable.
 */

/** Response headers as openapi-typescript declares them. */
interface ResponseHeaders {
  [name: string]: unknown;
}

/** A JSON success response with body `T`. */
interface JsonResponse<T> {
  headers: ResponseHeaders;
  content: { 'application/json': T };
}

/** A body-less success response (201 without body never occurs; used for 204). */
interface NoContentResponse {
  headers: ResponseHeaders;
  content?: never;
}

/** An RFC 9457 error response. */
interface ProblemResponse {
  headers: ResponseHeaders;
  content: { 'application/problem+json': components['schemas']['ProblemDetails'] };
}

/** A 400 validation error response with field `errors`. */
interface ValidationProblemResponse {
  headers: ResponseHeaders;
  content: { 'application/problem+json': components['schemas']['HttpValidationProblemDetails'] };
}

/** A JSON request body. */
interface JsonBody<T> {
  content: { 'application/json': T };
}

/** Errors every authenticated endpoint can return (§1: 401; §7: 403 `Auth.Forbidden`/`Auth.ReadOnly`/CSRF). */
interface AuthErrors {
  401: ProblemResponse;
  403: ProblemResponse;
}

/** Path item parameters without path parameters. */
interface NoParameters {
  query?: never;
  header?: never;
  path?: never;
  cookie?: never;
}

/** Path item parameters with the given path parameters. */
interface PathParameters<P> {
  query?: never;
  header?: never;
  path: P;
  cookie?: never;
}

type Schemas = components['schemas'];

export interface paths {
  '/api/auth/logout': {
    parameters: NoParameters;
    get?: never;
    put?: never;
    /** Clears the session cookie (§4.3). Anonymous allowed, CSRF header required, always 204. */
    post: operations['Logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/me': {
    parameters: NoParameters;
    /** The signed-in user (§4.4). */
    get: operations['GetCurrentUser'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/clusters': {
    parameters: NoParameters;
    /** Clusters the current user may switch to (§6). */
    get: operations['GetAccessibleClusters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users': {
    parameters: NoParameters;
    /** All users, sorted by username (§7.2). */
    get: operations['ListUsers'];
    put?: never;
    /** Pre-creates a user (§7.2). */
    post: operations['CreateUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}': {
    parameters: PathParameters<{ username: string }>;
    get: operations['GetUser'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/role': {
    parameters: PathParameters<{ username: string }>;
    get?: never;
    /** Promote/demote (§7.2 semantics, ADR-0017). */
    put: operations['ChangeUserRole'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/read-only': {
    parameters: PathParameters<{ username: string }>;
    get?: never;
    put: operations['SetUserReadOnly'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/deactivate': {
    parameters: PathParameters<{ username: string }>;
    get?: never;
    put?: never;
    post: operations['DeactivateUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/reactivate': {
    parameters: PathParameters<{ username: string }>;
    get?: never;
    put?: never;
    post: operations['ReactivateUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/grants': {
    parameters: PathParameters<{ username: string }>;
    /** The user's grants, sorted by cluster environment then name (§7.2/§9.2). */
    get: operations['ListUserGrants'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/users/{username}/grants/bulk': {
    parameters: PathParameters<{ username: string }>;
    get?: never;
    put?: never;
    /** All-or-nothing bulk grant (§9.4). */
    post: operations['BulkCreateGrants'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters': {
    parameters: NoParameters;
    /** All clusters, sorted by name (§8.2). */
    get: operations['ListClusters'];
    put?: never;
    post: operations['RegisterCluster'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}': {
    parameters: PathParameters<{ name: string }>;
    get: operations['GetCluster'];
    /** Full replacement of the editable fields; the name is immutable. */
    put: operations['UpdateCluster'];
    post?: never;
    /** Deletes a disabled cluster with its credentials and grants (CLU-6). */
    delete: operations['DeleteCluster'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/enable': {
    parameters: PathParameters<{ name: string }>;
    get?: never;
    put?: never;
    post: operations['EnableCluster'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/disable': {
    parameters: PathParameters<{ name: string }>;
    get?: never;
    put?: never;
    post: operations['DisableCluster'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/grants': {
    parameters: PathParameters<{ name: string }>;
    /** The cluster's grants, sorted by username (§8.2/§9.2). */
    get: operations['ListClusterGrants'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/credentials': {
    parameters: PathParameters<{ name: string }>;
    /** The cluster's credentials, sorted by name (§8.4). */
    get: operations['ListClusterCredentials'];
    put?: never;
    post: operations['AddCredential'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/credentials/{credentialId}': {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    get?: never;
    put?: never;
    post?: never;
    /** Refused with `Credentials.InUse` while grants use it (CRED-6). */
    delete: operations['DeleteCredential'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/credentials/{credentialId}/token': {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    get?: never;
    /** Rotates the token, keeping the id and grants (CRED-5). Does not run a test. */
    put: operations['RotateCredentialToken'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/credentials/{credentialId}/test': {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    get?: never;
    put?: never;
    /** Tests a stored credential; the result is stored as its last test (TEST-1/5). */
    post: operations['TestCredential'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/clusters/{name}/test-token': {
    parameters: PathParameters<{ name: string }>;
    get?: never;
    put?: never;
    /** Tests an unsaved token; nothing is stored. */
    post: operations['TestToken'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/credentials': {
    parameters: NoParameters;
    /** Credentials of all clusters, soonest expiry first (CRED-7). */
    get: operations['ListCredentials'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/grants': {
    parameters: NoParameters;
    get?: never;
    put?: never;
    post: operations['CreateGrant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/grants/{grantId}': {
    parameters: PathParameters<{ grantId: string }>;
    get?: never;
    put: operations['UpdateGrant'];
    post?: never;
    /** Revokes the grant (no version). */
    delete: operations['RevokeGrant'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/audit': {
    parameters: {
      query?: operations['ListAuditEntries']['parameters']['query'];
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Audit log, newest first, cursor-paginated (§10). */
    get: operations['ListAuditEntries'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}

export type webhooks = Record<string, never>;

export interface components {
  schemas: {
    // ---- Errors (§1, §2). `code` and `traceId` are ProblemDetails extensions the Api declares (orchestrator 2026-11-18).
    ProblemDetails: {
      type?: null | string;
      title?: null | string;
      /** Format: int32 */
      status?: null | number;
      detail?: null | string;
      instance?: null | string;
      /** @description Stable error code (contract §2), e.g. `Concurrency.Conflict`. Absent on framework 400s. */
      code?: null | string;
      traceId?: null | string;
    };
    HttpValidationProblemDetails: {
      type?: null | string;
      title?: null | string;
      /** Format: int32 */
      status?: null | number;
      detail?: null | string;
      instance?: null | string;
      code?: null | string;
      traceId?: null | string;
      /** @description Keyed by camelCase JSON path (`items[2].credentialId`); `""` = whole request. */
      errors?: {
        [key: string]: string[];
      };
    };

    // ---- Enums (§3)
    /** @enum {string} */
    UserRole: 'admin' | 'user';
    /** @enum {string} */
    UserStatus: 'pending' | 'active' | 'deactivated';
    /** @enum {string} */
    ClusterEnvironment: 'production' | 'staging' | 'development';
    /** @enum {string} */
    ClusterTlsMode: 'caBundle' | 'systemTrust' | 'skipVerify';
    /** @enum {string} */
    AccessMode: 'readOnly' | 'readWrite';
    /** @enum {string} */
    TokenType: 'jwt' | 'opaque';
    /** @enum {string} */
    CredentialExpiryStatus: 'ok' | 'expiringSoon' | 'expired' | 'noExpiry' | 'unknown';
    /** @enum {string} */
    CertificateExpiryStatus: 'ok' | 'expiringSoon' | 'expired';
    /** @enum {string} */
    ConnectionTestStep: 'reachability' | 'authentication' | 'identity' | 'openShiftVersion' | 'capabilities';
    /** @enum {string} */
    ConnectionTestStepStatus: 'passed' | 'warning' | 'failed' | 'skipped';
    /** @enum {string} */
    ProbeFailureKind:
      | 'dnsFailure'
      | 'connectionRefused'
      | 'timeout'
      | 'tlsUnknownAuthority'
      | 'tlsHostnameMismatch'
      | 'tlsCertificateExpired'
      | 'tlsOther'
      | 'unauthorized'
      | 'forbidden'
      | 'notFound'
      | 'unexpectedStatus'
      | 'invalidResponse';
    /** @enum {string} */
    CapabilityLevel: 'clusterAdmin' | 'clusterWideEdit' | 'clusterWideView' | 'limited';
    /** @enum {string} */
    CapabilityCategory: 'read' | 'write';
    /** @enum {string} */
    HintSeverity: 'info' | 'warning';
    /** @enum {string} */
    IdentitySource: 'selfSubjectReview' | 'tokenSubject';
    /** @enum {string} */
    AuditCategory: 'auth' | 'users' | 'clusters' | 'credentials' | 'grants';
    /** @enum {string} */
    AuditTargetType: 'session' | 'user' | 'cluster' | 'credential' | 'grant';

    // ---- Shared (§3)
    /** @description Last stored test result of a credential (TEST-5). */
    ConnectionTestSummary: {
      /** Format: date-time */
      testedAt: string;
      succeeded: boolean;
      /** @description `null` when `succeeded`. */
      failedStep: null | Schemas['ConnectionTestStep'];
      /** @description `null` when the capabilities step didn't run. */
      headline: null | Schemas['CapabilityLevel'];
      /** @description `testedAt` is older than the cluster's last connection-settings change (CLU-4). */
      isStale: boolean;
    };

    // ---- Auth (§4.4) and switcher (§6)
    CurrentUser: {
      username: string;
      displayName: null | string;
      role: Schemas['UserRole'];
      isReadOnly: boolean;
      groups: string[];
      isAdminViaConfiguration: boolean;
      /** @description e.g. `group fleetconsole-admins`; `null` when not admin via configuration. */
      adminConfigurationSource: null | string;
    };
    AccessibleCluster: {
      name: string;
      displayName: string;
      environment: Schemas['ClusterEnvironment'];
      /** @description Effective mode: `readOnly` if the grant is read-only or the user is globally read-only. */
      accessMode: Schemas['AccessMode'];
      webConsoleUrl: null | string;
    };

    // ---- Users (§7)
    UserListItem: {
      username: string;
      displayName: null | string;
      role: Schemas['UserRole'];
      isAdminViaConfiguration: boolean;
      isAdminByAssignment: boolean;
      adminConfigurationSource: null | string;
      status: Schemas['UserStatus'];
      isReadOnly: boolean;
      /** Format: int32 */
      grantCount: number;
      /** Format: date-time */
      lastLoginAt: null | string;
      groups: string[];
      /** Format: int64 (uint32) */
      version: number;
    };
    UserDetail: {
      username: string;
      displayName: null | string;
      role: Schemas['UserRole'];
      isAdminViaConfiguration: boolean;
      isAdminByAssignment: boolean;
      adminConfigurationSource: null | string;
      status: Schemas['UserStatus'];
      isReadOnly: boolean;
      /** Format: int32 */
      grantCount: number;
      /** Format: date-time */
      lastLoginAt: null | string;
      groups: string[];
      /** Format: date-time */
      createdAt: string;
      createdBy: string;
      /** Format: int64 (uint32) */
      version: number;
    };
    CreateUserRequest: {
      username: string;
      /** @default user */
      role?: Schemas['UserRole'];
      /** @default false */
      isReadOnly?: boolean;
    };
    ChangeUserRoleRequest: {
      role: Schemas['UserRole'];
      version: number;
    };
    SetUserReadOnlyRequest: {
      isReadOnly: boolean;
      version: number;
    };
    /** @description Body of every body-less transition (deactivate, enable, …). */
    VersionRequest: {
      version: number;
    };

    // ---- Clusters (§8.1)
    ClusterListItem: {
      name: string;
      displayName: string;
      environment: Schemas['ClusterEnvironment'];
      apiUrl: string;
      isEnabled: boolean;
      tlsMode: Schemas['ClusterTlsMode'];
      /** Format: int32 */
      credentialCount: number;
      /** @description `null` when the cluster has no credentials. */
      worstCredentialExpiryStatus: null | Schemas['CredentialExpiryStatus'];
      /** Format: int32 */
      grantCount: number;
      lastTest: null | Schemas['ConnectionTestSummary'];
      lastTestCredentialName: null | string;
      /** Format: int64 (uint32) */
      version: number;
    };
    ClusterDetail: {
      name: string;
      displayName: string;
      environment: Schemas['ClusterEnvironment'];
      apiUrl: string;
      webConsoleUrl: null | string;
      description: null | string;
      /** @description PEM; `null` = system trust. */
      caBundle: null | string;
      caCertificates: Schemas['CaCertificate'][];
      skipTlsVerify: boolean;
      tlsMode: Schemas['ClusterTlsMode'];
      isEnabled: boolean;
      /** Format: int32 */
      credentialCount: number;
      /** Format: int32 */
      grantCount: number;
      /** Format: date-time */
      connectionSettingsChangedAt: string;
      /** Format: date-time */
      createdAt: string;
      createdBy: string;
      /** Format: date-time */
      updatedAt: null | string;
      updatedBy: null | string;
      /** Format: int64 (uint32) */
      version: number;
    };
    CaCertificate: {
      subject: string;
      issuer: string;
      /** Format: date-time */
      notBefore: string;
      /** Format: date-time */
      notAfter: string;
      expiryStatus: Schemas['CertificateExpiryStatus'];
      /** @description Uppercase hex, colon-separated. */
      sha256Fingerprint: string;
    };
    RegisterClusterRequest: {
      name: string;
      displayName: null | string;
      apiUrl: string;
      environment: Schemas['ClusterEnvironment'];
      webConsoleUrl: null | string;
      description: null | string;
      caBundle: null | string;
      skipTlsVerify: boolean;
      /** @default true */
      isEnabled?: boolean;
    };
    UpdateClusterRequest: {
      displayName: null | string;
      apiUrl: string;
      environment: Schemas['ClusterEnvironment'];
      webConsoleUrl: null | string;
      description: null | string;
      caBundle: null | string;
      skipTlsVerify: boolean;
      version: number;
    };

    // ---- Credentials (§8.3, §8.4)
    Credential: {
      /** Format: uuid */
      id: string;
      clusterName: string;
      clusterDisplayName: string;
      clusterEnvironment: Schemas['ClusterEnvironment'];
      clusterIsEnabled: boolean;
      name: string;
      description: null | string;
      /** @description 8 lowercase hex chars (ADR-0004). */
      fingerprint: string;
      tokenType: Schemas['TokenType'];
      /** @description `<namespace>/<name>` when the subject is a ServiceAccount. */
      serviceAccount: null | string;
      subject: null | string;
      /** Format: date-time */
      issuedAt: null | string;
      /** Format: date-time */
      expiresAt: null | string;
      expiryStatus: Schemas['CredentialExpiryStatus'];
      /**
       * Format: int32
       * @description `Credentials:ExpiryWarningDays` — the "expiring soon" window, for alert text (CRED-8).
       */
      expiryWarningDays: number;
      /** Format: date-time */
      createdAt: string;
      createdBy: string;
      /** Format: date-time */
      rotatedAt: null | string;
      rotatedBy: null | string;
      lastTest: null | Schemas['ConnectionTestSummary'];
      /** Format: int32 */
      grantCount: number;
      /** Format: int32 */
      readWriteGrantCount: number;
      /** Format: int64 (uint32) */
      version: number;
    };
    AddCredentialRequest: {
      name: string;
      description: null | string;
      token: string;
    };
    RotateCredentialTokenRequest: {
      token: string;
      version: number;
    };
    TestCredentialRequest: {
      inspectNamespace: null | string;
    };
    TestTokenRequest: {
      token: string;
      /** Format: uuid */
      credentialId: null | string;
      inspectNamespace: null | string;
    };

    // ---- Connection test (§8.5)
    ConnectionTestResult: {
      /** @description No step failed (warnings allowed). */
      succeeded: boolean;
      /** Format: date-time */
      testedAt: string;
      /** Format: int32 */
      durationMs: number;
      /** @description Always all five steps, in execution order. */
      steps: Schemas['ConnectionTestStepResult'][];
      kubernetesVersion: null | string;
      identity: null | Schemas['ClusterIdentity'];
      openShiftVersion: null | Schemas['OpenShiftVersion'];
      capabilities: null | Schemas['CapabilitySummary'];
      /** @description Only when `inspectNamespace` was given and the step ran. */
      namespaceRules: null | Schemas['NamespaceRules'];
      hints: Schemas['ConnectionTestHint'][];
    };
    ConnectionTestStepResult: {
      step: Schemas['ConnectionTestStep'];
      status: Schemas['ConnectionTestStepStatus'];
      /** @description Human-readable; show verbatim. */
      message: string;
      failureKind: null | Schemas['ProbeFailureKind'];
    };
    ClusterIdentity: {
      username: string;
      source: Schemas['IdentitySource'];
    };
    OpenShiftVersion: {
      version: string;
      updateProgressing: boolean;
    };
    CapabilitySummary: {
      headline: Schemas['CapabilityLevel'];
      checks: Schemas['CapabilityCheckResult'][];
    };
    CapabilityCheckResult: {
      id: string;
      label: string;
      category: Schemas['CapabilityCategory'];
      allowed: boolean;
    };
    NamespaceRules: {
      namespace: string;
      incomplete: boolean;
      evaluationError: null | string;
      rules: Schemas['ResourceRule'][];
    };
    ResourceRule: {
      verbs: string[];
      apiGroups: string[];
      resources: string[];
      resourceNames: string[];
    };
    ConnectionTestHint: {
      severity: Schemas['HintSeverity'];
      message: string;
    };

    // ---- Grants (§9)
    Grant: {
      /** Format: uuid */
      id: string;
      username: string;
      userDisplayName: null | string;
      userStatus: Schemas['UserStatus'];
      clusterName: string;
      clusterDisplayName: string;
      clusterEnvironment: Schemas['ClusterEnvironment'];
      clusterIsEnabled: boolean;
      /** Format: uuid */
      credentialId: string;
      credentialName: string;
      credentialExpiryStatus: Schemas['CredentialExpiryStatus'];
      /** Format: date-time */
      credentialExpiresAt: null | string;
      credentialLastTest: null | Schemas['ConnectionTestSummary'];
      accessMode: Schemas['AccessMode'];
      /** Format: date-time */
      grantedAt: string;
      grantedBy: string;
      /** Format: date-time */
      updatedAt: null | string;
      updatedBy: null | string;
      /** Format: int64 (uint32) */
      version: number;
    };
    CreateGrantRequest: {
      username: string;
      clusterName: string;
      /** Format: uuid */
      credentialId: string;
      /** @default readOnly */
      accessMode?: Schemas['AccessMode'];
    };
    UpdateGrantRequest: {
      accessMode: Schemas['AccessMode'];
      /** Format: uuid */
      credentialId: string;
      version: number;
    };
    BulkGrantRequest: {
      accessMode: Schemas['AccessMode'];
      /** @description 1–100 items, `clusterName` unique within the request. */
      items: Schemas['BulkGrantItem'][];
    };
    BulkGrantItem: {
      clusterName: string;
      /** Format: uuid */
      credentialId: string;
    };

    // ---- Audit (§10)
    AuditPage: {
      items: Schemas['AuditEntry'][];
      /** @description `null` = no more pages. */
      nextCursor: null | string;
    };
    AuditEntry: {
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      occurredAt: string;
      /** @description Username, or `system (config)`. */
      actor: string;
      actorIsSystem: boolean;
      /** @description e.g. `user.promoted` (contract §10 action table). */
      action: string;
      category: Schemas['AuditCategory'];
      targetType: Schemas['AuditTargetType'];
      targetId: null | string;
      /** @description Display name at the time of the action (kept after deletion). */
      targetName: string;
      clusterName: null | string;
      summary: string;
      /** @description W3C trace id (32 hex). */
      correlationId: null | string;
      /** @description Structured JSON object, shape per action; render as JSON. */
      details: unknown;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type $defs = Record<string, never>;

export interface operations {
  Logout: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 204: NoContentResponse; 403: ProblemResponse };
  };
  GetCurrentUser: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['CurrentUser']>; 401: ProblemResponse };
  };
  GetAccessibleClusters: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['AccessibleCluster'][]>; 401: ProblemResponse };
  };

  ListUsers: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['UserListItem'][]> } & AuthErrors;
  };
  CreateUser: {
    parameters: NoParameters;
    requestBody: JsonBody<Schemas['CreateUserRequest']>;
    responses: {
      201: JsonResponse<Schemas['UserDetail']>;
      400: ValidationProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  GetUser: {
    parameters: PathParameters<{ username: string }>;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['UserDetail']>; 404: ProblemResponse } & AuthErrors;
  };
  ChangeUserRole: {
    parameters: PathParameters<{ username: string }>;
    requestBody: JsonBody<Schemas['ChangeUserRoleRequest']>;
    responses: {
      200: JsonResponse<Schemas['UserDetail']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  SetUserReadOnly: {
    parameters: PathParameters<{ username: string }>;
    requestBody: JsonBody<Schemas['SetUserReadOnlyRequest']>;
    responses: {
      200: JsonResponse<Schemas['UserDetail']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  DeactivateUser: {
    parameters: PathParameters<{ username: string }>;
    requestBody: JsonBody<Schemas['VersionRequest']>;
    responses: {
      200: JsonResponse<Schemas['UserDetail']>;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  ReactivateUser: {
    parameters: PathParameters<{ username: string }>;
    requestBody: JsonBody<Schemas['VersionRequest']>;
    responses: {
      200: JsonResponse<Schemas['UserDetail']>;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  ListUserGrants: {
    parameters: PathParameters<{ username: string }>;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['Grant'][]>; 404: ProblemResponse } & AuthErrors;
  };
  BulkCreateGrants: {
    parameters: PathParameters<{ username: string }>;
    requestBody: JsonBody<Schemas['BulkGrantRequest']>;
    responses: {
      /** @description Created grants, in request order. */
      200: JsonResponse<Schemas['Grant'][]>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
    } & AuthErrors;
  };

  ListClusters: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['ClusterListItem'][]> } & AuthErrors;
  };
  RegisterCluster: {
    parameters: NoParameters;
    requestBody: JsonBody<Schemas['RegisterClusterRequest']>;
    responses: {
      201: JsonResponse<Schemas['ClusterDetail']>;
      400: ValidationProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  GetCluster: {
    parameters: PathParameters<{ name: string }>;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['ClusterDetail']>; 404: ProblemResponse } & AuthErrors;
  };
  UpdateCluster: {
    parameters: PathParameters<{ name: string }>;
    requestBody: JsonBody<Schemas['UpdateClusterRequest']>;
    responses: {
      200: JsonResponse<Schemas['ClusterDetail']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  DeleteCluster: {
    parameters: PathParameters<{ name: string }>;
    requestBody?: never;
    responses: { 204: NoContentResponse; 404: ProblemResponse; 409: ProblemResponse } & AuthErrors;
  };
  EnableCluster: {
    parameters: PathParameters<{ name: string }>;
    requestBody: JsonBody<Schemas['VersionRequest']>;
    responses: {
      200: JsonResponse<Schemas['ClusterDetail']>;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  DisableCluster: {
    parameters: PathParameters<{ name: string }>;
    requestBody: JsonBody<Schemas['VersionRequest']>;
    responses: {
      200: JsonResponse<Schemas['ClusterDetail']>;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  ListClusterGrants: {
    parameters: PathParameters<{ name: string }>;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['Grant'][]>; 404: ProblemResponse } & AuthErrors;
  };

  ListCredentials: {
    parameters: NoParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['Credential'][]> } & AuthErrors;
  };
  ListClusterCredentials: {
    parameters: PathParameters<{ name: string }>;
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['Credential'][]>; 404: ProblemResponse } & AuthErrors;
  };
  AddCredential: {
    parameters: PathParameters<{ name: string }>;
    requestBody: JsonBody<Schemas['AddCredentialRequest']>;
    responses: {
      201: JsonResponse<Schemas['Credential']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  RotateCredentialToken: {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    requestBody: JsonBody<Schemas['RotateCredentialTokenRequest']>;
    responses: {
      200: JsonResponse<Schemas['Credential']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  DeleteCredential: {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    requestBody?: never;
    responses: { 204: NoContentResponse; 404: ProblemResponse; 409: ProblemResponse } & AuthErrors;
  };
  TestCredential: {
    parameters: PathParameters<{ name: string; credentialId: string }>;
    requestBody: JsonBody<Schemas['TestCredentialRequest']>;
    responses: {
      200: JsonResponse<Schemas['ConnectionTestResult']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
    } & AuthErrors;
  };
  TestToken: {
    parameters: PathParameters<{ name: string }>;
    requestBody: JsonBody<Schemas['TestTokenRequest']>;
    responses: {
      200: JsonResponse<Schemas['ConnectionTestResult']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
    } & AuthErrors;
  };

  CreateGrant: {
    parameters: NoParameters;
    requestBody: JsonBody<Schemas['CreateGrantRequest']>;
    responses: {
      201: JsonResponse<Schemas['Grant']>;
      400: ValidationProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  UpdateGrant: {
    parameters: PathParameters<{ grantId: string }>;
    requestBody: JsonBody<Schemas['UpdateGrantRequest']>;
    responses: {
      200: JsonResponse<Schemas['Grant']>;
      400: ValidationProblemResponse;
      404: ProblemResponse;
      409: ProblemResponse;
    } & AuthErrors;
  };
  RevokeGrant: {
    parameters: PathParameters<{ grantId: string }>;
    requestBody?: never;
    responses: { 204: NoContentResponse; 404: ProblemResponse } & AuthErrors;
  };

  ListAuditEntries: {
    parameters: {
      query?: {
        /** @description Exact actor name (`alice`, `system (config)`). */
        actor?: string;
        /** @description Username that is the actor or the target user. */
        user?: string;
        category?: components['schemas']['AuditCategory'];
        /** @description Exact cluster name. */
        cluster?: string;
        /** @description Case-insensitive substring of the target display name. */
        target?: string;
        /** @description ISO 8601; `occurredAt >= from`. */
        from?: string;
        /** @description ISO 8601; `occurredAt < to`. */
        to?: string;
        /** @description Opaque `nextCursor` of the previous page. */
        cursor?: string;
        /** @description 1–200, default 50. */
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: { 200: JsonResponse<Schemas['AuditPage']>; 400: ValidationProblemResponse } & AuthErrors;
  };
}
