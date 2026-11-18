---
id: T-0008
title: Domain model — clusters, credentials, grants
status: todo
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
- [ ] QG-1: unit tests for one grant per (user, cluster), credential-belongs-to-cluster on create and change, cluster
      name immutability (no setter/method changes it), delete only when disabled (CLU-6), credential delete refused
      while in use (CRED-6).
- [ ] CLU-1/2/3 value-object rules table-tested (URL shapes, PEM parsing with a generated test cert, mutual exclusion).
- [ ] CLU-4: endpoint change sets `ConnectionSettingsChangedAt`; non-endpoint edits don't. `ClusterUpdated.ChangedFields` correct.
- [ ] CRED-3/4: `TokenMetadata.ServiceAccount` and `StatusAt` (ok/expiringSoon/expired/noExpiry/unknown) table-tested.
- [ ] Rotate resets `LastTest`; idempotent transitions raise no events.
- [ ] XML docs; Domain references only the BCL. Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
