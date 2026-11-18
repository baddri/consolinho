# CP1 — HTTP API contract (backend ⇄ frontend)

**Author:** backend-architect · **Date:** 2026-11-18 · **Checkpoint:** CP1 · **Spec:** `CP1-identity-and-admin.md`
**Conventions:** ADR-0013 (shape), ADR-0012 (CSRF, anonymous surface), ADR-0009 (session), ADR-0010 (OAuth flow),
ADR-0011 (connection test), ADR-0008 (audit).

This document is the design-time contract. The running Api's `/openapi/v1.json` is the final source; the SPA generates
`web/src/shared/api/schema.gen.ts` from it (`npm run gen:api`). If the two disagree, raise it — don't silently follow
either. C# names below are the record names; OpenAPI schema names drop the `Dto` suffix (`UserDetailDto` → `UserDetail`).

---

## 1. Global rules

| Topic | Rule |
|---|---|
| Base path | All endpoints under `/api`. Same origin as the SPA (cookie session, no CORS). |
| Auth | Cookie `FleetConsole.Session` (HttpOnly; the SPA never reads it). Every `/api` endpoint requires a session **except** the four in §4/§5 marked *anonymous*. `/api/admin/**` additionally requires role `admin`. |
| CSRF | Every request under `/api` with method other than GET/HEAD/OPTIONS must send `X-Console-Request: 1`, else **403** `Auth.CsrfHeaderMissing` before anything else runs (ADR-0012). The shared `apiClient` already does this. |
| JSON | camelCase properties. Numbers strict (a quoted number → 400). Enums are camelCase strings (§3). Timestamps ISO 8601 UTC (`2026-11-18T09:30:00+00:00`). Ids are GUID strings. Nullable fields are present with `null`, not omitted. |
| Errors | (orchestrator 2026-11-18: the OpenAPI document must declare the `code` and `traceId` extensions on the ProblemDetails schemas so they are generated into FE types.) RFC 9457 ProblemDetails: `type`, `title`, `status`, `detail` (human-readable — **show verbatim**), `instance`, `traceId`, `code` (stable, §2). 400 validation adds `errors: { "<camelCasePath>": ["message", ...] }` whose keys match request JSON paths (`items[2].credentialId`); an empty key `""` means "whole request". Framework 400s (malformed JSON, unknown enum, quoted number) have no `code`. |
| Concurrency | Representations of users, clusters, credentials and grants carry `version` (uint32). Edit/transition requests send it back; mismatch → 409 `Concurrency.Conflict`. Creates/deletes/revokes take no version. |
| Responses | Create → 201 + `Location` + body. Edit/transition → 200 + updated representation (fresh `version`). Delete → 204. Transitions to the current state are idempotent 200s (no audit entry). |
| Lists | Bounded lists are plain JSON arrays (filter/sort client-side). The audit log is cursor-paginated (§10). |
| 401 | Any authenticated endpoint without a valid session → 401 ProblemDetails `code: "Auth.Unauthenticated"`. This includes a session invalidated by revalidation (deactivated user, ≤ 60 s after the change). The SPA decides whether to show "session ended" (it had a user before) or plain login. |

---

## 2. Error code catalogue

| `code` | Status | When / `detail` (examples; the `detail` text is authoritative at runtime) |
|---|---|---|
| `Validation.Failed` | 400 | Field validation; see `errors`. |
| `Auth.Unauthenticated` | 401 | No/invalid/ended session. "Authentication required." |
| `Auth.Forbidden` | 403 | Non-admin calling `/api/admin/**`. "You don't have access to Administration." |
| `Auth.ReadOnly` | 403 | Globally read-only user calling an admin **command**. "Your account is read-only." |
| `Auth.CsrfHeaderMissing` | 403 | Missing/invalid `X-Console-Request`. "Missing CSRF header." |
| `Concurrency.Conflict` | 409 | Stale `version`. "This user was changed by someone else. Reload and try again." (noun per resource) |
| `Persistence.DuplicateKey` | 409 | Rare race on a unique key the handler pre-checked. "This item already exists. Reload and try again." |
| `Users.NotFound` | 404 | Unknown `{username}` in route. |
| `Users.UsernameTaken` | 409 | Create with existing username. "User alice already exists." |
| `Users.LastAdmin` | 409 | ADM-5: demote/deactivate/set read-only the last active, writable admin. "alice is the last active administrator who can make changes. Promote another user first." |
| `Users.SelfChange` | 409 | ADM-5: admin demotes or deactivates themselves. "You can't demote or deactivate yourself. Ask another administrator." |
| `Users.AdminViaConfiguration` | 409 | USR-6: demote a config-sourced admin. "Admin granted by configuration (group fleetconsole-admins). Change the configuration to remove." |
| `Clusters.NotFound` | 404 | Unknown `{name}` in route. |
| `Clusters.NameTaken` | 409 | Register with existing name. "Cluster prod-eu-1 already exists." |
| `Clusters.NotDisabled` | 409 | CLU-6: delete an enabled cluster. "Disable prod-eu-1 before deleting it." |
| `Credentials.NotFound` | 404 | Unknown `{credentialId}` (or it belongs to another cluster). |
| `Credentials.NameTaken` | 409 | Name already used on this cluster. |
| `Credentials.InUse` | 409 | CRED-6: delete while grants use it. "Credential fleet-view is used by 3 grants. Re-assign or revoke them first." |
| `Grants.NotFound` | 404 | Unknown `{grantId}`. |
| `Grants.AlreadyExists` | 409 | GRANT-1: second grant for (user, cluster) on single create. "alice already has access to prod-eu-1 — change the existing grant instead". (Bulk reports it as a 400 field error instead, §9.4.) |

Body references to unknown/invalid things (username in a grant request, credential of another cluster, …) are **400
field errors**, not 404 (ADR-0013 §8). Field messages are listed with each request.

---

## 3. Enums (JSON string values)

| C# enum | Values | Notes |
|---|---|---|
| `UserRole` | `admin`, `user` | |
| `UserStatus` | `pending`, `active`, `deactivated` | `pending` = never logged in and not deactivated. |
| `ClusterEnvironment` | `production`, `staging`, `development` | Fixed set (Q5). Sort order: this order. |
| `ClusterTlsMode` | `caBundle`, `systemTrust`, `skipVerify` | Derived from CA bundle / skip flag. |
| `AccessMode` | `readOnly`, `readWrite` | |
| `TokenType` | `jwt`, `opaque` | `opaque` → UI warning (Q10). |
| `CredentialExpiryStatus` | `ok`, `expiringSoon`, `expired`, `noExpiry`, `unknown` | Severity order for "worst": `expired` > `expiringSoon` > `unknown` > `noExpiry` > `ok`. `unknown` = opaque token. Window: `Credentials:ExpiryWarningDays` (14). |
| `CertificateExpiryStatus` | `ok`, `expiringSoon`, `expired` | CA certs; window 30 days (CLU-2). |
| `ConnectionTestStep` | `reachability`, `authentication`, `identity`, `openShiftVersion`, `capabilities` | Order of execution. |
| `ConnectionTestStepStatus` | `passed`, `warning`, `failed`, `skipped` | |
| `ProbeFailureKind` | `dnsFailure`, `connectionRefused`, `timeout`, `tlsUnknownAuthority`, `tlsHostnameMismatch`, `tlsCertificateExpired`, `tlsOther`, `unauthorized`, `forbidden`, `notFound`, `unexpectedStatus`, `invalidResponse` | |
| `CapabilityLevel` | `clusterAdmin`, `clusterWideEdit`, `clusterWideView`, `limited` | Headline (TEST-3). |
| `CapabilityCategory` | `read`, `write` | |
| `HintSeverity` | `info`, `warning` | |
| `IdentitySource` | `selfSubjectReview`, `tokenSubject` | |
| `AuditCategory` | `auth`, `users`, `clusters`, `credentials`, `grants` | |
| `AuditTargetType` | `session`, `user`, `cluster`, `credential`, `grant` | |

### Shared record: `ConnectionTestSummaryDto`
Last stored test result of a credential (TEST-5).

```csharp
public sealed record ConnectionTestSummaryDto(
    DateTimeOffset TestedAt,
    bool Succeeded,
    ConnectionTestStep? FailedStep,   // null when Succeeded
    CapabilityLevel? Headline,        // null when the capabilities step didn't run
    bool IsStale);                    // TestedAt < cluster.connectionSettingsChangedAt (CLU-4)
```
JSON: `testedAt`, `succeeded`, `failedStep`, `headline`, `isStale`.

---

## 4. Authentication — `/api/auth`

### 4.1 `GET /api/auth/login?returnUrl=<path>` — *anonymous*
Starts the OAuth flow (AUTH-1). Full-page navigation, never `fetch`.

| Case | Response |
|---|---|
| Normal | 302 → host OAuth `authorization_endpoint` (`response_type=code`, `scope=user:info`, `state`, `code_challenge`, `code_challenge_method=S256`, `redirect_uri={publicOrigin}/api/auth/callback`). |
| Already signed in | 302 → sanitized `returnUrl`. |
| OAuth metadata unavailable | 302 → `/login?error=unavailable&returnUrl=<sanitized>` |

`returnUrl` sanitization (AUTH-2): accepted only if it starts with exactly one `/`, contains no `\`, no control
characters and no scheme; otherwise `/`. Applied here and again at the callback.

### 4.2 `GET /api/auth/callback` — *anonymous* (OAuth middleware, not a mapped endpoint)
Redirect target of the OAuth server. Always a 302:

| Outcome | Redirect |
|---|---|
| Signed in (cookie set) | `<returnUrl>` |
| AUTH-6 unknown user, auto-provisioning off | `/login?error=not_registered&username=<ocp-username>&returnUrl=…` |
| AUTH-7 deactivated | `/login?error=deactivated&returnUrl=…` |
| AUTH-14 user cancelled (`error=access_denied`) | `/login?error=cancelled&returnUrl=…` |
| AUTH-14 host OAuth / `users/~` unreachable or 5xx | `/login?error=unavailable&returnUrl=…` |
| Anything else (state/PKCE mismatch, invalid code) | `/login?error=failed&returnUrl=…` |

`/login` query parameters produced by the **backend**: `error ∈ {not_registered, deactivated, cancelled, unavailable,
failed}`, `username` (only with `not_registered`), `returnUrl`. SPA-only parameters (`loggedOut=1`, session-ended
hints) are the frontend's choice. Messages per spec AUTH-6/7/14; `failed`: "Login failed. Please try again."

### 4.3 `POST /api/auth/logout` — *anonymous allowed*, CSRF header required
Clears the session cookie; audits `auth.logout` when a session existed. **204** always (idempotent). The SPA then
navigates to `/login?loggedOut=1` (AUTH-10). No request body.

### 4.4 `GET /api/auth/me` — authenticated
AUTH-9. **200** `CurrentUserDto`; **401** when not signed in.

```csharp
public sealed record CurrentUserDto(
    string Username,
    string? DisplayName,              // OCP fullName from last login
    UserRole Role,
    bool IsReadOnly,
    IReadOnlyList<string> Groups,     // OCP groups at last login
    bool IsAdminViaConfiguration,
    string? AdminConfigurationSource); // e.g. "group fleetconsole-admins" | "user list"; null when not via config
```
JSON: `username`, `displayName`, `role`, `isReadOnly`, `groups`, `isAdminViaConfiguration`, `adminConfigurationSource`.
Reflects the session claims refreshed at most `Auth:RevalidationInterval` ago for role/read-only; groups/display name
come from the database.

---

## 5. System — `GET /api/system/info` — *anonymous* (unchanged)
**200** `SystemInfoDto { version, environment }`. Stays anonymous for the login page footer (ADR-0012).

---

## 6. Cluster switcher — `GET /api/clusters` — authenticated
SW-1. **200** `AccessibleClusterDto[]`: enabled clusters on which the current (active) user has a grant. Admins get
only their own grants (GRANT-6). Sorted by environment (`production`, `staging`, `development`) then `name` (ordinal).

```csharp
public sealed record AccessibleClusterDto(
    string Name,
    string DisplayName,
    ClusterEnvironment Environment,
    AccessMode AccessMode,      // EFFECTIVE mode: readOnly if the grant is readOnly OR the user is globally read-only
    string? WebConsoleUrl);
```
JSON: `name`, `displayName`, `environment`, `accessMode`, `webConsoleUrl`. Never contains API URL, CA or credential data.
Empty array for users without grants (SW-4).

---

## 7. Admin — users (`/api/admin/users`)
All require role `admin` (403 `Auth.Forbidden`). Commands (POST/PUT) additionally return 403 `Auth.ReadOnly` for
read-only admins (ADM-2). **Check order (orchestrator 2026-11-19):** CSRF → 401 → `Auth.Forbidden` → `Auth.ReadOnly`
→ field validation (`Validation.Failed`). Framework 400s for malformed JSON / wrong JSON types still come first because
they happen during model binding. A read-only admin therefore gets `Auth.ReadOnly`, never field errors.

### 7.1 Records
```csharp
public sealed record UserListItemDto(
    string Username, string? DisplayName, UserRole Role, bool IsAdminViaConfiguration, bool IsAdminByAssignment,
    string? AdminConfigurationSource,   // orchestrator 2026-11-18: list USR-6 tooltip names the group
    UserStatus Status, bool IsReadOnly, int GrantCount, DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Groups,
    uint Version);                      // orchestrator 2026-11-18: list kebab actions need it

public sealed record UserDetailDto(
    string Username, string? DisplayName, UserRole Role, bool IsAdminViaConfiguration, bool IsAdminByAssignment,
    string? AdminConfigurationSource, UserStatus Status, bool IsReadOnly, int GrantCount,
    DateTimeOffset? LastLoginAt, IReadOnlyList<string> Groups,
    DateTimeOffset CreatedAt, string CreatedBy,   // "alice" (pre-created by) or the user's own name (auto-provisioned)
    uint Version);
```

### 7.2 Endpoints

| Method & route | Request body | Success | Errors |
|---|---|---|---|
| `GET /api/admin/users` | — | 200 `UserListItemDto[]` (sorted by username) | 401, 403 |
| `POST /api/admin/users` | `CreateUserRequest` | 201 `UserDetailDto`, `Location: /api/admin/users/{username}` | 400, 409 `Users.UsernameTaken` |
| `GET /api/admin/users/{username}` | — | 200 `UserDetailDto` | 404 `Users.NotFound` |
| `PUT /api/admin/users/{username}/role` | `ChangeUserRoleRequest` | 200 `UserDetailDto` | 400, 404, 409 `Concurrency.Conflict` / `Users.LastAdmin` / `Users.SelfChange` / `Users.AdminViaConfiguration` |
| `PUT /api/admin/users/{username}/read-only` | `SetUserReadOnlyRequest` | 200 `UserDetailDto` | 400, 404, 409 `Concurrency.Conflict` / `Users.LastAdmin` |
| `POST /api/admin/users/{username}/deactivate` | `VersionRequest` | 200 `UserDetailDto` | 404, 409 `Concurrency.Conflict` / `Users.LastAdmin` / `Users.SelfChange` |
| `POST /api/admin/users/{username}/reactivate` | `VersionRequest` | 200 `UserDetailDto` | 404, 409 `Concurrency.Conflict` |
| `GET /api/admin/users/{username}/grants` | — | 200 `GrantDto[]` (§9.1) sorted by cluster environment then name | 404 |
| `POST /api/admin/users/{username}/grants/bulk` | `BulkGrantRequest` | see §9.4 | |

```csharp
public sealed record CreateUserRequest(string Username, UserRole Role = UserRole.User, bool IsReadOnly = false);
public sealed record ChangeUserRoleRequest(UserRole Role, uint Version);
public sealed record SetUserReadOnlyRequest(bool IsReadOnly, uint Version);
public sealed record VersionRequest(uint Version);   // shared by all body-less transitions
```

Validation (`CreateUserRequest.username`, USR-2): required; 1–253 chars; exact and case-sensitive; must not contain
`/`, `%`, whitespace or control characters; must not be `.`, `..` or `~`. Message examples: "Username is required.",
"Username can't contain '/', '%' or whitespace."

Semantics:
- Promote (`role: admin`) sets "admin by assignment" (`isAdminByAssignment`). It does so **also when the user is
  already admin via configuration** and is audited (`user.promoted`, `configurationSource` = the current source), so
  the role survives leaving the config group. It is a no-op (200, no audit entry) only when `isAdminByAssignment` is
  already true (ADR-0017). Demote (`role: user`) clears it; refused while admin via configuration. A user who is admin
  via configuration **and** by assignment stays admin when removed from the config group (ADR-0009).
- UI: offer Promote when `isAdminByAssignment` is false (including Admins with `isAdminViaConfiguration`), Demote when
  `role` is `admin` and `isAdminViaConfiguration` is false.
- Deactivate rotates the security stamp: the user's sessions end within `Auth:RevalidationInterval`. Grants are kept.
- Read-only on an admin blocks admin commands (ADM-2) and (CP2) cluster mutations.
- Setting read-only has no `Users.SelfChange` check: an admin may make themselves read-only unless that hits
  `Users.LastAdmin` (no active writable admin would remain; pending admins count as active).

---

## 8. Admin — clusters and credentials (`/api/admin/clusters`, `/api/admin/credentials`)

### 8.1 Cluster records
```csharp
public sealed record ClusterListItemDto(
    string Name, string DisplayName, ClusterEnvironment Environment, string ApiUrl, bool IsEnabled,
    ClusterTlsMode TlsMode, int CredentialCount,
    CredentialExpiryStatus? WorstCredentialExpiryStatus,   // null when no credentials
    int GrantCount,                                        // = users with access (one grant per user+cluster)
    ConnectionTestSummaryDto? LastTest,                    // newest test across this cluster's credentials
    string? LastTestCredentialName,
    uint Version);                                         // orchestrator 2026-11-18: list actions (enable/disable) need it

public sealed record ClusterDetailDto(
    string Name, string DisplayName, ClusterEnvironment Environment, string ApiUrl,
    string? WebConsoleUrl, string? Description,
    string? CaBundle,                                      // PEM, not secret (CLU-2); null = system trust
    IReadOnlyList<CaCertificateDto> CaCertificates,        // parsed from CaBundle; empty when null
    bool SkipTlsVerify, ClusterTlsMode TlsMode, bool IsEnabled,
    int CredentialCount, int GrantCount,
    DateTimeOffset ConnectionSettingsChangedAt,
    DateTimeOffset CreatedAt, string CreatedBy, DateTimeOffset? UpdatedAt, string? UpdatedBy,
    uint Version);

public sealed record CaCertificateDto(
    string Subject, string Issuer, DateTimeOffset NotBefore, DateTimeOffset NotAfter,
    CertificateExpiryStatus ExpiryStatus, string Sha256Fingerprint);   // fingerprint: uppercase hex, colon-separated
```

### 8.2 Cluster endpoints

| Method & route | Body | Success | Errors |
|---|---|---|---|
| `GET /api/admin/clusters` | — | 200 `ClusterListItemDto[]` sorted by name | |
| `POST /api/admin/clusters` | `RegisterClusterRequest` | 201 `ClusterDetailDto`, `Location: /api/admin/clusters/{name}` | 400, 409 `Clusters.NameTaken` |
| `GET /api/admin/clusters/{name}` | — | 200 `ClusterDetailDto` | 404 `Clusters.NotFound` |
| `PUT /api/admin/clusters/{name}` | `UpdateClusterRequest` | 200 `ClusterDetailDto` | 400, 404, 409 `Concurrency.Conflict` |
| `POST /api/admin/clusters/{name}/enable` | `VersionRequest` | 200 `ClusterDetailDto` | 404, 409 `Concurrency.Conflict` |
| `POST /api/admin/clusters/{name}/disable` | `VersionRequest` | 200 `ClusterDetailDto` | 404, 409 `Concurrency.Conflict` |
| `DELETE /api/admin/clusters/{name}` | — | 204 (removes its credentials and grants) | 404, 409 `Clusters.NotDisabled` |
| `GET /api/admin/clusters/{name}/grants` | — | 200 `GrantDto[]` sorted by username | 404 |
| `GET /api/admin/clusters/{name}/credentials` | — | 200 `CredentialDto[]` sorted by name | 404 |

```csharp
public sealed record RegisterClusterRequest(
    string Name, string? DisplayName, string ApiUrl, ClusterEnvironment Environment,
    string? WebConsoleUrl, string? Description, string? CaBundle, bool SkipTlsVerify, bool IsEnabled = true);

public sealed record UpdateClusterRequest(          // full replacement of editable fields (PUT); name is immutable
    string? DisplayName, string ApiUrl, ClusterEnvironment Environment,
    string? WebConsoleUrl, string? Description, string? CaBundle, bool SkipTlsVerify, uint Version);
```

Validation (CLU-1/2/3), field keys as in JSON:
- `name` (register only): required; 1–40 chars; DNS label `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`. "Use lowercase letters,
  digits and '-' (max 40), starting and ending with a letter or digit."
- `displayName`: ≤ 100 chars; null/blank → defaults to `name`.
- `apiUrl`: required; absolute `https://` URL with host and optional port; no path (other than `/`), query, fragment or
  user info; ≤ 2048 chars. Stored without trailing `/`.
- `webConsoleUrl`: optional absolute `https://` URL, ≤ 2048.
- `description`: ≤ 1000 chars.
- `caBundle`: optional; ≤ 256 KiB; must parse into ≥ 1 X.509 certificate ("The CA bundle must contain at least one PEM
  certificate."). Blank → null (system trust).
- `skipTlsVerify` with a non-empty `caBundle` → error on `skipTlsVerify`: "Skip TLS verification and a CA bundle are
  mutually exclusive."
- Production confirmation for Skip TLS (CLU-3) is UI-only.

Semantics: changing `apiUrl`, `caBundle` or `skipTlsVerify` sets `connectionSettingsChangedAt` → every stored test
summary of the cluster's credentials reports `isStale: true` (CLU-4). Disable/enable keep grants and credentials
(CLU-5). Delete requires disabled (CLU-6); counts for the confirmation come from `credentialCount`/`grantCount`.

### 8.3 Credential records
```csharp
public sealed record CredentialDto(
    Guid Id,
    string ClusterName, string ClusterDisplayName, ClusterEnvironment ClusterEnvironment, bool ClusterIsEnabled,
    string Name, string? Description,
    string Fingerprint,                 // 8 lowercase hex chars (ADR-0004)
    TokenType TokenType,
    string? ServiceAccount,             // "<namespace>/<name>" when sub = system:serviceaccount:<ns>:<name>
    string? Subject,                    // raw JWT sub; null for opaque tokens
    DateTimeOffset? IssuedAt,           // JWT iat
    DateTimeOffset? ExpiresAt,          // JWT exp; null = no expiry / unknown
    CredentialExpiryStatus ExpiryStatus,
    int ExpiryWarningDays,              // orchestrator 2026-11-18: Credentials:ExpiryWarningDays, for CRED-8 alert text
    DateTimeOffset CreatedAt, string CreatedBy,
    DateTimeOffset? RotatedAt, string? RotatedBy,
    ConnectionTestSummaryDto? LastTest,
    int GrantCount, int ReadWriteGrantCount,
    uint Version);
```
The token itself never appears in any response, log, audit entry or error (CRED-2).

### 8.4 Credential endpoints

| Method & route | Body | Success | Errors |
|---|---|---|---|
| `GET /api/admin/credentials` | — | 200 `CredentialDto[]` all clusters, sorted by `expiresAt` ascending (nulls last), then cluster, name (CRED-7) | |
| `GET /api/admin/clusters/{name}/credentials` | — | 200 `CredentialDto[]` | 404 `Clusters.NotFound` |
| `POST /api/admin/clusters/{name}/credentials` | `AddCredentialRequest` | 201 `CredentialDto`, `Location: /api/admin/clusters/{name}/credentials/{id}` | 400, 404, 409 `Credentials.NameTaken` |
| `PUT /api/admin/clusters/{name}/credentials/{credentialId}/token` | `RotateCredentialTokenRequest` | 200 `CredentialDto` | 400, 404 `Clusters.NotFound`/`Credentials.NotFound`, 409 `Concurrency.Conflict` |
| `DELETE /api/admin/clusters/{name}/credentials/{credentialId}` | — | 204 | 404, 409 `Credentials.InUse` |
| `POST /api/admin/clusters/{name}/credentials/{credentialId}/test` | `TestCredentialRequest` | 200 `ConnectionTestResultDto` (stored as last test) | 400, 404 |
| `POST /api/admin/clusters/{name}/test-token` | `TestTokenRequest` | 200 `ConnectionTestResultDto` (nothing stored) | 400, 404 |

```csharp
public sealed record AddCredentialRequest(string Name, string? Description, string Token);
public sealed record RotateCredentialTokenRequest(string Token, uint Version);
public sealed record TestCredentialRequest(string? InspectNamespace);
public sealed record TestTokenRequest(string Token, Guid? CredentialId, string? InspectNamespace);
```

Validation (CRED-1):
- `name`: required; 1–63 chars; `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`; unique per cluster (409).
- `description`: ≤ 1000 chars.
- `token`: trimmed, then required; no internal whitespace ("The token must not contain spaces or line breaks.");
  ≤ 16384 chars. Opaque (non-JWT) tokens are **accepted** (Q10) — the response says `tokenType: "opaque"`.
- `inspectNamespace`: optional DNS label, ≤ 63.
- `TestTokenRequest.credentialId`: optional; when given it must be a credential of `{name}` (400 field error
  otherwise). Used only for TEST-4 hints (grant counts) while rotating.

Semantics: rotate keeps the id and all grants (CRED-5), records old→new fingerprint in the audit, and does **not** run a
test — "Test new token" is a separate `test-token` call, "Save anyway" is UI-only. Rotate clears the credential's
stored `lastTest` (it described the old token); `lastTest` is `null` until the next `…/test`. Testing works on disabled clusters
(TEST-1). Test endpoints are admin **commands** (read-only admins get 403 `Auth.ReadOnly`).

### 8.5 Connection test result
```csharp
public sealed record ConnectionTestResultDto(
    bool Succeeded,                                   // no step failed (warnings allowed)
    DateTimeOffset TestedAt,
    int DurationMs,
    IReadOnlyList<ConnectionTestStepResultDto> Steps, // always all 5, in order
    string? KubernetesVersion,                        // gitVersion
    ClusterIdentityDto? Identity,
    OpenShiftVersionDto? OpenShiftVersion,
    CapabilitySummaryDto? Capabilities,
    NamespaceRulesDto? NamespaceRules,                // only when inspectNamespace was given and the step ran
    IReadOnlyList<ConnectionTestHintDto> Hints);

public sealed record ConnectionTestStepResultDto(
    ConnectionTestStep Step, ConnectionTestStepStatus Status,
    string Message,                                   // human-readable, show verbatim
    ProbeFailureKind? FailureKind);                   // set for failed (and some warning) steps

public sealed record ClusterIdentityDto(string Username, IdentitySource Source);
public sealed record OpenShiftVersionDto(string Version, bool UpdateProgressing);

public sealed record CapabilitySummaryDto(CapabilityLevel Headline, IReadOnlyList<CapabilityCheckResultDto> Checks);
public sealed record CapabilityCheckResultDto(string Id, string Label, CapabilityCategory Category, bool Allowed);

public sealed record NamespaceRulesDto(
    string Namespace, bool Incomplete, string? EvaluationError, IReadOnlyList<ResourceRuleDto> Rules);
public sealed record ResourceRuleDto(
    IReadOnlyList<string> Verbs, IReadOnlyList<string> ApiGroups,
    IReadOnlyList<string> Resources, IReadOnlyList<string> ResourceNames);

public sealed record ConnectionTestHintDto(HintSeverity Severity, string Message);
```
Step messages (examples, TEST-2): `reachability` passed "Reachable, Kubernetes v1.31.4"; failed with
`tlsUnknownAuthority` "Certificate signed by unknown authority — add the cluster CA bundle"; `authentication` failed
"Token rejected by the cluster (expired, revoked, or for another cluster)"; `openShiftVersion` warning "Not visible with
this credential".

Initial check set (ADR-0011 `CapabilityCheckSet`; the UI must render whatever list it receives):
`list-pods`, `list-deployments`, `list-events`, `get-pod-logs`, `list-secrets`, `list-nodes`, `list-clusteroperators`,
`list-namespaces` (category `read`); `patch-deployments`, `delete-pods`, `create-pods-exec`, `update-configmaps`
(category `write`).

Hints (TEST-4): warning "N users have ReadWrite grants with this credential but it cannot modify workloads" (when
`ReadWriteGrantCount > 0` and any write check is denied); info "This credential is cluster-admin; ReadOnly grants rely on
FleetConsole's read-only guard" (headline `clusterAdmin` and the credential has ReadOnly grants). For `test-token`
without `credentialId` there are no grant-based hints.

---

## 9. Admin — grants

### 9.1 Record
```csharp
public sealed record GrantDto(
    Guid Id,
    string Username, string? UserDisplayName, UserStatus UserStatus,
    string ClusterName, string ClusterDisplayName, ClusterEnvironment ClusterEnvironment, bool ClusterIsEnabled,
    Guid CredentialId, string CredentialName, CredentialExpiryStatus CredentialExpiryStatus,
    DateTimeOffset? CredentialExpiresAt, ConnectionTestSummaryDto? CredentialLastTest,
    AccessMode AccessMode,
    DateTimeOffset GrantedAt, string GrantedBy, DateTimeOffset? UpdatedAt, string? UpdatedBy,
    uint Version);
```
GRANT-5 markers ("Cluster disabled", "Credential expired", deactivated user) are derived by the UI from
`clusterIsEnabled`, `credentialExpiryStatus`, `userStatus`.

### 9.2 Endpoints

| Method & route | Body | Success | Errors |
|---|---|---|---|
| `GET /api/admin/users/{username}/grants` | — | 200 `GrantDto[]` | 404 `Users.NotFound` |
| `GET /api/admin/clusters/{name}/grants` | — | 200 `GrantDto[]` | 404 `Clusters.NotFound` |
| `POST /api/admin/grants` | `CreateGrantRequest` | 201 `GrantDto`, `Location: /api/admin/grants/{id}` | 400, 409 `Grants.AlreadyExists` |
| `PUT /api/admin/grants/{grantId}` | `UpdateGrantRequest` | 200 `GrantDto` | 400, 404 `Grants.NotFound`, 409 `Concurrency.Conflict` |
| `DELETE /api/admin/grants/{grantId}` | — | 204 | 404 |
| `POST /api/admin/users/{username}/grants/bulk` | `BulkGrantRequest` | 200 `GrantDto[]` (created grants, request order) | 400, 404 `Users.NotFound` |

```csharp
public sealed record CreateGrantRequest(string Username, string ClusterName, Guid CredentialId, AccessMode AccessMode = AccessMode.ReadOnly);
public sealed record UpdateGrantRequest(AccessMode AccessMode, Guid CredentialId, uint Version);
public sealed record BulkGrantRequest(AccessMode AccessMode, IReadOnlyList<BulkGrantItem> Items);
public sealed record BulkGrantItem(string ClusterName, Guid CredentialId);
```

### 9.3 Create / update rules (GRANT-1/2/3)
400 field errors: `username` "User bob doesn't exist."; `clusterName` "Cluster x doesn't exist."; `credentialId`
"Credential doesn't exist." / "This credential belongs to another cluster." Grants may be created for deactivated
users and disabled clusters (they are kept and marked, GRANT-5). Changing the credential to one of another cluster →
400 on `credentialId`. Revoke takes no version.

### 9.4 Bulk (GRANT-4)
All-or-nothing: either every item becomes a grant (one audit entry each) or nothing is written.
- `items`: 1–100 entries; `clusterName` unique within the request ("Cluster listed twice.").
- Per-item problems are **400 field errors** keyed by index so the review table can mark rows:
  `items[3].clusterName` "Cluster x doesn't exist." / "alice already has access to prod-eu-1.";
  `items[3].credentialId` "Credential doesn't exist." / "This credential belongs to another cluster."
- "Preferred credential name" pre-selection and the production ReadWrite warning are UI-only.

---

## 10. Admin — audit log — `GET /api/admin/audit`
AUD-4/5. Read-only admins may call it. Newest first; keyset pagination stable while new entries arrive.

Query parameters (all optional; combined with AND):

| Param | Type | Meaning |
|---|---|---|
| `actor` | string | Exact actor name (`alice`, `system (config)`). |
| `user` | string | Username that is the actor, the target user, **or the user of a target grant** (`grant.*` entries) (USR-7 link; orchestrator 2026-11-19). Backend stores a related-username column for user and grant targets so this is an indexed equality match. |
| `category` | `AuditCategory` | |
| `cluster` | string | Exact cluster name (entries about the cluster itself, its credentials and grants). |
| `target` | string | Case-insensitive substring of the target display name. |
| `from`, `to` | ISO 8601 timestamp | `occurredAt >= from`, `occurredAt < to`. |
| `cursor` | string | Opaque value from the previous page's `nextCursor`. |
| `limit` | int | 1–200, default 50. |

Invalid values → 400 (`errors` keyed by parameter name, e.g. `limit`, `cursor`).

```csharp
public sealed record AuditPageDto(IReadOnlyList<AuditEntryDto> Items, string? NextCursor);  // null = no more

public sealed record AuditEntryDto(
    Guid Id,
    DateTimeOffset OccurredAt,
    string Actor,                 // username, or "system (config)"
    bool ActorIsSystem,
    string Action,                // see table
    AuditCategory Category,
    AuditTargetType TargetType,
    string? TargetId,             // GUID or name; informational
    string TargetName,            // display name at the time of the action (kept after deletion)
    string? ClusterName,
    string Summary,               // one human-readable sentence
    string? CorrelationId,        // W3C trace id (32 hex)
    JsonElement? Details);        // structured JSON object (shape per action below); render as JSON
```

Actions (AUD-1) and `details` shapes:

| Action | Category / target | `details` |
|---|---|---|
| `auth.login` | auth / session | `{ "groups": [..], "provisioned": bool }` |
| `auth.login_denied` | auth / session | `{ "reason": "notRegistered" \| "deactivated" }` |
| `auth.logout` | auth / session | `{}` |
| `user.provisioned` | users / user | `{ "source": "login" }` (actor = the user, AUTH-5) |
| `user.created` | users / user | `{ "role": "user", "isReadOnly": false }` |
| `user.promoted`, `user.demoted` | users / user | `{ "source": "manual" \| "configuration", "configurationSource": "group fleetconsole-admins" \| null }` (configuration → actor `system (config)`; manual → `configurationSource` is the source the user already had, non-null only when promoting a config admin, ADR-0017) |
| `user.deactivated`, `user.reactivated` | users / user | `{}` |
| `user.read_only_changed` | users / user | `{ "isReadOnly": bool }` |
| `cluster.registered` | clusters / cluster | `{ "environment", "apiUrl", "tlsMode", "isEnabled" }` |
| `cluster.updated` | clusters / cluster | `{ "changedFields": ["apiUrl", "caBundle", ...] }` (never CA content) |
| `cluster.enabled`, `cluster.disabled` | clusters / cluster | `{}` |
| `cluster.deleted` | clusters / cluster | `{ "credentialCount": n, "grantCount": n }` |
| `credential.added` | credentials / credential | `{ "fingerprint", "tokenType", "serviceAccount" }` |
| `credential.rotated` | credentials / credential | `{ "oldFingerprint", "newFingerprint" }` |
| `credential.deleted` | credentials / credential | `{ "fingerprint" }` |
| `credential.tested` | credentials / credential | `{ "succeeded", "failedStep", "headline" }` |
| `credential.token_tested` | credentials / cluster | `{ "succeeded", "failedStep", "headline", "fingerprint" }` (unsaved token) |
| `grant.created` | grants / grant | `{ "username", "accessMode", "credential" }` |
| `grant.changed` | grants / grant | `{ "oldAccessMode", "newAccessMode", "oldCredential", "newCredential" }` |
| `grant.revoked` | grants / grant | `{ "username", "accessMode", "credential" }` |

Grant entries use `targetName` "alice → prod-eu-1" and `clusterName` set. Category for the UI filter maps 1:1 to the
action prefix. No endpoint modifies or deletes audit entries (AUD-3).

---

## 11. DevOAuth emulator (`src/FleetConsole.DevOAuth`, development and tests only)

Emulates the subset of the OpenShift OAuth server + host API server that FleetConsole uses (ADR-0010). Not under
`/api`; no CSRF header; not part of the SPA contract, documented here so both sides know the dev flow.

| Method & path | Behaviour |
|---|---|
| `GET /.well-known/oauth-authorization-server` | `{ "issuer": "<self>", "authorization_endpoint": "<self>/oauth/authorize", "token_endpoint": "<self>/oauth/token", "scopes_supported": ["user:info", "user:check-access", "user:full"], "response_types_supported": ["code", "token"], "grant_types_supported": ["authorization_code", "implicit"], "code_challenge_methods_supported": ["plain", "S256"] }` |
| `GET /oauth/authorize?client_id&redirect_uri&response_type=code&scope&state&code_challenge&code_challenge_method` | Validates `client_id` and `response_type`; renders an HTML page "FleetConsole DevOAuth — pick a user" with one button per configured user (name, full name, groups) and a **Cancel** button. Any invalid request (unknown client, non-absolute/fragment `redirect_uri`, `response_type` ≠ `code`, missing/unknown `scope`, bad PKCE parameters, repeated parameter) → 400 HTML page, never an error redirect. Any absolute http(s) `redirect_uri` is accepted (the dev Vite port changes per run); the token request must repeat it exactly. |
| `POST /oauth/authorize` (form: the original query values + `username` or `cancel=1`) | Selection → 302 `redirect_uri?code=<random>&state=<state>`; cancel → 302 `redirect_uri?error=access_denied&error_description=...&state=<state>`. Codes are single-use, valid 60 s, bound to client, redirect_uri, PKCE challenge, user. |
| `POST /oauth/token` (form: `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`; client via HTTP Basic or `client_id`/`client_secret` form fields) | 200 `{ "access_token": "sha256~<random>", "token_type": "Bearer", "expires_in": 86400, "scope": "user:info" }`; errors 400 `{ "error": "invalid_grant" \| "invalid_client" \| "invalid_request", "error_description": "..." }` (bad/expired/used code, redirect mismatch, PKCE mismatch, bad secret), `unsupported_grant_type` for other grants; a client that fails **HTTP Basic** authentication gets 401 + `WWW-Authenticate: Basic` instead (RFC 6749 §5.2; the Api sends form fields, so it sees 400). A code is consumed by any redemption attempt that passes client authentication, including a failed one. Responses carry `Cache-Control: no-store`. |
| `GET /apis/user.openshift.io/v1/users/~` (`Authorization: Bearer <access_token>`) | 200 `{ "kind": "User", "apiVersion": "user.openshift.io/v1", "metadata": { "name": "alice", "uid": "<stable guid>" }, "fullName": "Alice Example", "identities": ["devoauth:alice"], "groups": ["sre", "system:authenticated", "system:authenticated:oauth"] }` (`fullName` omitted when empty; real OCP also includes `system:` virtual groups — login must ignore `system:*` groups for admin/display purposes but may store them); unknown/expired token → 401 Kubernetes `Status` JSON. |

Configuration (`src/FleetConsole.DevOAuth/appsettings.json`; obviously fake values, never real secrets):
```json
{
  "DevOAuth": {
    "Clients": [
      { "ClientId": "fleetconsole-dev", "ClientSecret": "dev-only-not-a-secret" }
    ],
    "Users": [
      { "Name": "admin", "FullName": "Fleet Admin",   "Groups": ["fleetconsole-admins"] },
      { "Name": "alice", "FullName": "Alice Example", "Groups": ["sre"] },
      { "Name": "bob",   "FullName": null,            "Groups": [] },
      { "Name": "ines",  "FullName": "Ines Auditor",  "Groups": ["auditors"] }
    ]
  }
}
```
Matching Api dev config (`src/FleetConsole.Api/appsettings.Development.json`): `Auth:OpenShift:ClientId =
fleetconsole-dev`, `ClientSecret = dev-only-not-a-secret`, `Auth:AdminGroups = ["fleetconsole-admins"]`,
`Auth:AutoProvision = true`. `ines` exists so the read-only-admin (auditor) demo can be set up by an admin.

---

## 12. Configuration keys (Api)

| Key | Default | Notes |
|---|---|---|
| `Console:PublicOrigin` | dev: `http://localhost:5180` (AppHost overrides with the Vite URL) | Required outside Development. Browser-visible origin; OAuth `redirect_uri` base. |
| `Auth:OpenShift:HostApiServerUrl` | — (AppHost injects DevOAuth URL) | Required. Host cluster API server, e.g. `https://api.host.example.com:6443`. |
| `Auth:OpenShift:ClientId` / `ClientSecret` | — | Prod: `system:serviceaccount:<ns>:<sa>` / SA token from a Secret. |
| `Auth:OpenShift:AuthorizationEndpoint` / `TokenEndpoint` | null | Optional; skip discovery. |
| `Auth:OpenShift:CaBundlePath` | null | CA for the host API/OAuth server. |
| `Auth:OpenShift:SkipTlsVerify` | false | Development only (startup error elsewhere). |
| `Auth:AutoProvision` | `true` (Q1) | |
| `Auth:BootstrapAdminUsers` | `[]` | Usernames. |
| `Auth:AdminGroups` | `[]` (dev: `["fleetconsole-admins"]`) | OCP group names. |
| `Auth:SessionLifetime` | `08:00:00` | Sliding. |
| `Auth:RevalidationInterval` | `00:01:00` (Q4) | |
| `Credentials:ExpiryWarningDays` | `14` (Q11) | |
| `Credentials:ConnectionTestTimeout` | `00:00:15` | |
| `DataProtection:KeyEncryptionCertificatePath` (+ `...PasswordPath`) | null | Protects the key ring at rest (ADR-0004). Warning at startup when absent outside Development; required from CP3. |

---

## 13. Endpoint → spec → task map

| Endpoint(s) | Spec | Backend task |
|---|---|---|
| `/api/auth/login`, `/callback`, `/logout`, `/me` | AUTH-1..14 | T-0014 (use cases), T-0015 (HTTP) |
| CSRF middleware, anonymous surface | AUTH-13, ADM-1 | T-0011 |
| `/api/admin/users/**` (except grants) | USR-1..8, ADM-1..5 | T-0016 |
| `/api/admin/clusters/**` (cluster CRUD) | CLU-1..8 | T-0017 |
| credentials (`/api/admin/credentials`, `/clusters/{name}/credentials/**` excl. test) | CRED-1..8 | T-0018 |
| grants, `/api/clusters` | GRANT-1..6, SW-1 | T-0019 |
| `.../test`, `.../test-token` | TEST-1..5 | T-0010 (probe client), T-0020 |
| `/api/admin/audit` | AUD-1..5 | T-0013 (writing), T-0021 (reading) |
