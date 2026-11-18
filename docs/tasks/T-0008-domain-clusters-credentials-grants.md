---
id: T-0008
title: Domain model — clusters, credentials, grants
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0007]
paths: [src/FleetConsole.Domain/Clusters/, src/FleetConsole.Domain/Credentials/, src/FleetConsole.Domain/Access/, tests/FleetConsole.Domain.Tests/]
review_rounds: 0
---

## Goal
Model registered clusters (connection settings, environment, enable/disable/delete rules), SA credentials (encrypted
token + display metadata + last test summary) and grants (user ↔ cluster ↔ credential with access mode), with the
cross-aggregate invariants of CP1 unit-tested. **Parallel group W2** (with T-0011).

## Scope
- In: the three Domain folders, their value objects, events, errors, unit tests.
- Out: persistence, token encryption/JWT parsing (Application, T-0018), probing (T-0010/T-0020).

## Contract / design notes
Read ADR-0008, ADR-0011 (summary recorded on the credential), ADR-0013 §3 (idempotent transitions), contract §3, §8, §9.
Domain never sees plaintext tokens (BACKEND.md). All events carry ids **and** display names needed for audit (contract §10).

**Clusters** (`Domain/Clusters/`; replaces the "ClusterSlug" name in BACKEND.md with `ClusterName`)
```csharp
public readonly record struct ClusterId(Guid Value) { public static ClusterId New(); }
public sealed record ClusterName { string Value; static Result<ClusterName> Create(string?); }   // DNS label, ≤ 40
public enum ClusterEnvironment { Production, Staging, Development }   // declaration order = sort order
public enum ClusterTlsMode { CaBundle, SystemTrust, SkipVerify }
public sealed record CaCertificateInfo(string Subject, string Issuer, DateTimeOffset NotBefore, DateTimeOffset NotAfter, string Sha256Fingerprint);
public sealed record CaBundle { string Pem; IReadOnlyList<CaCertificateInfo> Certificates; static Result<CaBundle> Create(string? pem); }
    // X509Certificate2Collection.ImportFromPem; ≥ 1 cert; ≤ 256 KiB; field error key "caBundle"
public sealed record ApiServerEndpoint
{
    Uri Url; CaBundle? CaBundle; bool SkipTlsVerify; ClusterTlsMode TlsMode;
    static Result<ApiServerEndpoint> Create(string? url, string? caBundlePem, bool skipTlsVerify);
    // https only, host + optional port, no path/query/fragment/userinfo; skip + CA → error on "skipTlsVerify"
}
public sealed class Cluster : AggregateRoot<ClusterId>
{
    ClusterName Name (immutable); string DisplayName; ApiServerEndpoint Endpoint; ClusterEnvironment Environment;
    Uri? WebConsoleUrl; string? Description; bool IsEnabled; DateTimeOffset ConnectionSettingsChangedAt;
    DateTimeOffset CreatedAt; string CreatedBy; DateTimeOffset? UpdatedAt; string? UpdatedBy;

    static Cluster Register(ClusterName name, string? displayName, ApiServerEndpoint endpoint, ClusterEnvironment env,
        Uri? webConsoleUrl, string? description, bool isEnabled, string actor, DateTimeOffset now);       // ClusterRegistered
    void Update(string? displayName, ApiServerEndpoint endpoint, ClusterEnvironment env, Uri? webConsoleUrl,
        string? description, string actor, DateTimeOffset now);
        // ClusterUpdated(changedFields: camelCase names as in the API, e.g. "apiUrl","caBundle","skipTlsVerify");
        // no event when nothing changed; endpoint change → ConnectionSettingsChangedAt = now
    void Enable(string actor, DateTimeOffset now); void Disable(string actor, DateTimeOffset now);   // idempotent
    Result MarkForDeletion(int credentialCount, int grantCount);    // ClusterErrors.NotDisabled when enabled; ClusterDeleted
}
```
Events: `ClusterRegistered(ClusterId, string Name, ClusterEnvironment, string ApiUrl, ClusterTlsMode, bool IsEnabled)`,
`ClusterUpdated(ClusterId, string Name, IReadOnlyList<string> ChangedFields)`, `ClusterEnabled(ClusterId, string Name)`,
`ClusterDisabled(ClusterId, string Name)`, `ClusterDeleted(ClusterId, string Name, int CredentialCount, int GrantCount)`.
`ClusterErrors`: `NotFound(name)`, `NameTaken(name)`, `NotDisabled(name)` (contract §2).

**Credentials** (`Domain/Credentials/`)
```csharp
public readonly record struct CredentialId(Guid Value) { public static CredentialId New(); }
public sealed record CredentialName { ... static Result<CredentialName> Create(string?); }   // DNS label, ≤ 63
public sealed record EncryptedToken(byte[] Value);    // opaque; never decrypted in Domain; ToString redacts
public sealed record TokenFingerprint { string Value; static Result<TokenFingerprint> Create(string hex8); }
public enum TokenType { Jwt, Opaque }
public enum CredentialExpiryStatus { Ok, ExpiringSoon, Expired, NoExpiry, Unknown }
public sealed record TokenMetadata(TokenType Type, string? Subject, DateTimeOffset? IssuedAt, DateTimeOffset? ExpiresAt)
{
    public string? ServiceAccount { get; }   // "ns/name" from "system:serviceaccount:ns:name"
    public CredentialExpiryStatus StatusAt(DateTimeOffset now, TimeSpan warningWindow);   // CRED-4
}
public enum ConnectionTestStep { Reachability, Authentication, Identity, OpenShiftVersion, Capabilities }
public enum CapabilityLevel { ClusterAdmin, ClusterWideEdit, ClusterWideView, Limited }
public sealed record ConnectionTestSummary(DateTimeOffset TestedAt, bool Succeeded, ConnectionTestStep? FailedStep, CapabilityLevel? Headline);
public sealed class Credential : AggregateRoot<CredentialId>
{
    ClusterId ClusterId; CredentialName Name; string? Description; EncryptedToken Token; TokenFingerprint Fingerprint;
    TokenMetadata Metadata; DateTimeOffset CreatedAt; string CreatedBy; DateTimeOffset? RotatedAt; string? RotatedBy;
    ConnectionTestSummary? LastTest;

    static Credential Add(Cluster cluster, CredentialName name, string? description, EncryptedToken token,
        TokenFingerprint fingerprint, TokenMetadata metadata, string actor, DateTimeOffset now);   // CredentialAdded
    void Rotate(EncryptedToken token, TokenFingerprint fingerprint, TokenMetadata metadata, string actor, DateTimeOffset now);
        // CredentialRotated(old, new fingerprint); LastTest reset to null (it tested the old token)
    void RecordTest(ConnectionTestSummary summary, string clusterName);                        // CredentialTested
    Result MarkForDeletion(int grantCount, string clusterName);   // CredentialErrors.InUse(name, count) when > 0; CredentialDeleted
}
```
Events carry `ClusterId`, cluster name, credential name, fingerprint(s), metadata/test fields per contract §10.
`CredentialErrors`: `NotFound()`, `NameTaken(name, cluster)`, `InUse(name, grantCount)`.

**Grants** (`Domain/Access/`)
```csharp
public readonly record struct GrantId(Guid Value) { public static GrantId New(); }
public enum AccessMode { ReadOnly, ReadWrite }
public sealed record GrantLabels(string Username, string ClusterName, string CredentialName);   // audit display names
public sealed class Grant : AggregateRoot<GrantId>
{
    UserId UserId; ClusterId ClusterId; CredentialId CredentialId; AccessMode AccessMode;
    DateTimeOffset GrantedAt; string GrantedBy; DateTimeOffset? UpdatedAt; string? UpdatedBy;

    static Result<Grant> Create(User user, Cluster cluster, Credential credential, AccessMode mode,
        IReadOnlySet<ClusterId> clustersUserAlreadyHasGrantsOn, string actor, DateTimeOffset now);
        // GrantErrors.AlreadyExists(username, cluster) | GrantErrors.CredentialNotInCluster; GrantCreated
    Result Change(AccessMode mode, Credential newCredential, GrantLabels current, string actor, DateTimeOffset now);
        // newCredential.ClusterId must equal ClusterId; GrantChanged(old/new mode, old/new credential name); no-op → no event
    void Revoke(GrantLabels labels);                                                            // GrantRevoked
}
```
`GrantErrors`: `NotFound()`, `AlreadyExists(username, cluster)` (Conflict), `CredentialNotInCluster()` (Validation,
code `Grants.CredentialNotInCluster`).

## Acceptance criteria
- [x] QG-1: unit tests for one grant per (user, cluster), credential-belongs-to-cluster on create and change, cluster
      name immutability (no setter/method changes it), delete only when disabled (CLU-6), credential delete refused
      while in use (CRED-6).
- [x] CLU-1/2/3 value-object rules table-tested (URL shapes, PEM parsing with a generated test cert, mutual exclusion).
- [x] CLU-4: endpoint change sets `ConnectionSettingsChangedAt`; non-endpoint edits don't. `ClusterUpdated.ChangedFields` correct.
- [x] CRED-3/4: `TokenMetadata.ServiceAccount` and `StatusAt` (ok/expiringSoon/expired/noExpiry/unknown) table-tested.
- [x] Rotate resets `LastTest`; idempotent transitions raise no events.
- [x] XML docs; Domain references only the BCL. Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-18 backend-engineer: started; read CLAUDE.md, BACKEND.md, SECURITY.md (token handling), ADR-0004/0008/0011/0013, contract §2/§3/§8/§9/§10, T-0007 code.
- 2026-11-19 backend-engineer: implemented. Added `Domain/Clusters/` (ClusterId, ClusterName, ClusterEnvironment,
  ClusterTlsMode, CaCertificateInfo, CaBundle, ApiServerEndpoint, ClusterErrors, Cluster, `Events/` x5),
  `Domain/Credentials/` (CredentialId, CredentialName, EncryptedToken, TokenFingerprint, TokenType,
  CredentialExpiryStatus, TokenMetadata, ConnectionTestStep, CapabilityLevel, ConnectionTestSummary, CredentialErrors,
  Credential, `Events/` x4), `Domain/Access/` (GrantId, AccessMode, GrantLabels, GrantErrors, Grant, `Events/` x3).
  Tests: `DomainTestData.cs` (builders + generated self-signed cert/key PEM), `Clusters/` (ClusterName, CaBundle,
  ApiServerEndpoint, Cluster), `Credentials/` (value objects, Credential), `Access/GrantTests`.
  **Outside `paths` (minimal):** new `src/FleetConsole.Domain/Common/DnsLabel.cs`, an `internal` helper holding the
  single DNS-label regex shared by `ClusterName` and `CredentialName`, so the two rules cannot drift.
  **Deviation from the task sketch:** `Credential.Rotate` takes an extra `string clusterName` (before `actor`), like
  `RecordTest`/`MarkForDeletion`, because `CredentialRotated` must carry the cluster name for the audit entry
  (contract §10) and the aggregate does not own it.
  Checks: `dotnet build FleetConsole.slnx -warnaserror` green (0 warnings); `dotnet test FleetConsole.slnx` green
  (Domain 320, Application 62, Api 222 incl. Testcontainers via podman). The solution build/test includes the
  parallel agents' uncommitted T-0009/T-0010 files as they were at the time of the run.

## Review
**2026-11-19 backend-architect — APPROVE** (round 1)

Checks run by the reviewer: `dotnet build FleetConsole.slnx -warnaserror` green (0 warnings, 0 errors);
`dotnet test FleetConsole.slnx` green (Domain 320, Application 62, Api 222; Testcontainers via podman). The solution
includes the in-progress T-0011 files; nothing failed because of them. Domain csproj unchanged (BCL only; X.509 types
are BCL). All acceptance criteria verified against the code and tests.

Rulings on the points raised in the work log / handover:
- **Extra `clusterName` on `Credential.Rotate`** — accepted. Consistent with `RecordTest`/`MarkForDeletion`; the event
  needs the name (contract §10) and the aggregate references the cluster by id only. Recorded as a convention in
  BACKEND.md and in T-0018.
- **`Domain/Common/DnsLabel.cs` outside `paths`** — accepted. `internal`, one regex shared by two name VOs; avoiding
  rule drift is the right call. Listed in BACKEND.md's Domain tree.
- **Field-keyed `ValidationError` (endpoint/CA bundle) vs plain `InvalidName` errors** — accepted, and now a written
  convention (BACKEND.md, Domain): single-field VOs return a plain validation error, multi-field VOs return a
  `ValidationError` keyed by JSON names. The Api's camelCasing leaves the keys unchanged.
- **Refusing `PRIVATE KEY` blocks; 256 KiB measured in UTF-8 bytes** — accepted. The bundle is returned by the API,
  so key material must never be stored there; "KiB" is a byte limit and PEM is ASCII anyway. T-0017 must test the
  private-key case (added there).
- **`Rotate` never a no-op** — accepted. ADR-0013 §3 covers idempotent state *transitions*; the Domain can't compare
  plaintexts and an 8-char fingerprint match proves nothing, so each rotation is an audited admin action.
- **`RecordTest` raises `CredentialTested` on every run** — accepted. Each test is an admin action (contract §10
  `credential.tested`), not a transition. The consistency throw (`Succeeded` vs `FailedStep`) is a fair bug guard.
- **`Grant.Create` order (`CredentialNotInCluster` before `AlreadyExists`)** — accepted. Input validation (400) before
  state conflict (409) matches ADR-0013. In bulk, a row with both problems reports only `credentialId`; acceptable.
- **`StatusAt` boundaries** — accepted. `exp <= now` → expired follows RFC 7519 §4.1.4; inclusive warning window is
  table-tested at the 14-day boundary and with a zero window. T-0017 reuses the same boundaries for CA certificates.
- **`ApiServerEndpoint.ToString()` as canonical form** — accepted (documented in XML docs, the event param docs and
  the handover). See optional nit 1.
- **https enforcement for `apiUrl`** (T-0010 relies on it) — confirmed: `ParseUrl` rejects any scheme other than
  `https` after `Uri` lowercases it (`ApiServerEndpoint.cs` `uri.Scheme != Uri.UriSchemeHttps`), tested with `http://`,
  `ftp://` and scheme-less input; T-0010's probe re-checks as defence in depth.
- **Follow-ups** — captured by the architect in the dependent tasks ("From T-0008" paragraphs): T-0012 (mapping of
  `ApiServerEndpoint`/`CaBundle`/`EncryptedToken`, canonical `api_url`, derived properties not mapped, column-length
  constants, `IsStaleSince`), T-0013 (the 12 events → actions/details/targets, every-run events intended, empty
  allow-list), T-0017 (validator use of the factories, throws on `webConsoleUrl`/lengths, CA cert expiry status in the
  query, canonical `apiUrl`, extra 400 tests), plus T-0018 (Rotate signature), T-0019 (check order, bulk message,
  `GrantLabels`), T-0020 (`RecordTest` contract).

Reviewer doc fixes: BACKEND.md — `DnsLabel` in the Domain tree, the two conventions above, `clusterSlug` →
`clusterName` in the proxy sketch.

Optional (no re-review needed):
1. `src/FleetConsole.Domain/Clusters/ApiServerEndpoint.cs:103` — persistence and DTOs depend on `ToString()`; a named
   property (e.g. `public string CanonicalUrl`) that `ToString()` delegates to would make that dependency explicit and
   harder to break by a "debug-friendly" `ToString` edit. Can be done in T-0012 if it is the first to need it.
2. `src/FleetConsole.Domain/Clusters/CaBundle.cs:109` — `PemEncoding.TryFind` skips blocks with invalid base64, so a
   malformed `PRIVATE KEY` block is not detected (and a malformed `CERTIFICATE` block yields the generic "at least one
   certificate" message). Harmless; mention it in the remarks if you touch the file again.
3. `src/FleetConsole.Domain/Access/GrantErrors.cs:25` — the message ends with a period while the contract §2 quote does
   not; consistent with the other messages, so keep it — MSW mocks (T-0023) should use the server text.

## Handover notes
- **Deviation:** `Credential.Rotate(token, fingerprint, metadata, clusterName, actor, now)` has an extra `clusterName`
  parameter (see Work log). T-0018's handler passes `cluster.Name.Value`.
- **Field-keyed errors.** `ApiServerEndpoint.Create` and `CaBundle.Create` return a `ValidationError` keyed by the JSON
  names `apiUrl`, `caBundle`, `skipTlsVerify` (constants `ApiServerEndpoint.ApiUrlFieldName`,
  `SkipTlsVerifyFieldName`, `CaBundle.FieldName`), reporting every broken field at once. T-0017's register/update
  handler (or validator) can return that error directly; the Api's camelCase conversion leaves those keys unchanged.
  `ClusterName.Create` / `CredentialName.Create` follow the `Username` pattern instead: plain validation errors
  (`Clusters.InvalidName`, `Credentials.InvalidName`) whose messages validators surface on `name`. Validators should
  call these factories rather than repeating the rules. The constants `MaxLength`, `MaxUrlLength`, `MaxSizeBytes`,
  `Cluster.MaxDisplayNameLength`/`MaxDescriptionLength`/`MaxWebConsoleUrlLength` and `Credential.MaxDescriptionLength`
  are there for validators and EF column lengths.
- **Extra rules beyond the contract text:**
  - CA bundles containing a `PRIVATE KEY` PEM block are refused ("The CA bundle must not contain a private key.").
    The bundle is shown to admins and returned by the API, so key material must not get in.
  - A `CERTIFICATE` block with valid base64 but undecodable DER gets "The CA bundle contains a certificate that can't
    be parsed."; anything else without a certificate gets the contract message.
  - Size is measured in UTF-8 bytes after trimming.
  - API URL error messages: "API URL is required.", "...at most 2048 characters long.", "...must be an absolute
    https:// URL.", "...must contain only a host and an optional port (no path, query, fragment or user info).".
    Error code inside the domain is `Clusters.InvalidApiUrl` (only its message reaches the client, as a field error).
- **Canonical API URL.** `ApiServerEndpoint.Url` is the scheme + authority (lowercased host, default port 443 dropped);
  `ToString()` gives the text without a trailing `/`. Use `endpoint.ToString()` for `apiUrl` in DTOs and for
  persistence (the `Uri` always prints a trailing `/`).
- **Persistence hints (T-0012).** `ApiServerEndpoint` has a private constructor `(Uri url, CaBundle? caBundle, bool
  skipTlsVerify)`. `CaBundle` has no such constructor: re-create it from the stored PEM with `CaBundle.Create` (it
  parses the certificates) or store the certificate summaries alongside. `CaBundle` equality compares PEM only.
  `EncryptedToken` compares bytes and copies its input. `TlsMode`, `TokenMetadata.ServiceAccount` and expiry status
  are derived and should not be mapped. `ClusterUpdated.ChangedFields` is in request order.
- **Cluster semantics.** `Update` compares the API URL by its canonical text, the CA bundle by PEM, and display name and
  description after normalisation (blank display name means the cluster name; blank description means null). It sets
  `UpdatedAt/By` only when something changed. `Enable`/`Disable` stamp `UpdatedAt/By` on a real transition. A new
  cluster's `ConnectionSettingsChangedAt` is its registration time. `webConsoleUrl` that isn't an absolute https URL
  throws `ArgumentException`: the validator must reject it first.
- **Credential semantics.** `Rotate` is never a no-op: the Domain can't compare plaintexts, so every rotation is audited.
  `RecordTest` (T-0020) raises `CredentialTested` on every call and throws when `Succeeded` disagrees with `FailedStep`.
  `ConnectionTestSummary.IsStaleSince(cluster.ConnectionSettingsChangedAt)` implements CLU-4's `isStale`.
  `TokenMetadata.Opaque` is the metadata for non-JWT tokens. `StatusAt`: `exp <= now` is Expired, and
  `exp - now <= window` is ExpiringSoon (inclusive boundary).
- **Grant semantics.** `Grant.Create` checks `CredentialNotInCluster` before `AlreadyExists`. For bulk grants (T-0019),
  include clusters granted by earlier items of the same request in `clustersUserAlreadyHasGrantsOn`.
  `Change` takes `GrantLabels` whose `CredentialName` is the *current* (old) credential's name; the new name comes from
  `newCredential`. The `AlreadyExists` message ends with a period.
- **Not modelled here:** CA certificate expiry status (`CertificateExpiryStatus`, 30-day window) is not in the task's
  Domain list. Compute it in the query (T-0017), or add `CaCertificateInfo.StatusAt` later if it is needed in more than
  one place.
- **Audit coverage (ADR-0008 §5).** The 12 new events (`Cluster*` x5, `Credential*` x4, `Grant*` x3) need audit handlers
  (T-0013's event-to-entry mapping), or entries on the coverage test's allow-list. Once that test exists it will fail until they
  are added.
