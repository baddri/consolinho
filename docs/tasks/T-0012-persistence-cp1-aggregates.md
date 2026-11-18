---
id: T-0012
title: Persistence for CP1 aggregates — EF mappings, migration, repositories, read model, Data Protection, conflict mapping
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0007, T-0008, T-0010]   # T-0010 for SensitiveString
paths: [src/FleetConsole.Application/Abstractions/, src/FleetConsole.Application/Audit/IAuditTrail.cs, src/FleetConsole.Application/Credentials/CredentialsOptions.cs, src/FleetConsole.Application/Common/, src/FleetConsole.Application/Behaviors/UnitOfWorkBehavior.cs, src/FleetConsole.Application/FleetConsole.Application.csproj, src/FleetConsole.Infrastructure/, Directory.Packages.props, tests/FleetConsole.Api.Tests/Persistence/, tests/FleetConsole.Api.Tests/ArchitectureTests.cs, tests/FleetConsole.Api.Tests/ProjectFileArchitectureTests.cs, tests/FleetConsole.Application.Tests/Behaviors/]
review_rounds: 0
---

## Goal
Persist users, clusters, credentials, grants and audit entries in **one** migration, expose them to commands through
repositories and to queries through `IReadModel`, persist the Data Protection key ring in Postgres and implement
`ITokenProtector` (ADR-0004), and turn concurrency/unique-key races into 409 results. After this task every CP1 feature
task only adds Application use cases and endpoints. **Wave W3** (critical path).

## Scope
- In: ports listed below; EF configurations; migration `IdentityAndAdministration`; repositories; `ReadModel`;
  `ITokenProtector` + Data Protection setup; `IAuditTrail` **interface only** (implemented by T-0013);
  `CredentialsOptions`; `UnitOfWorkBehavior` conflict mapping; allow `Microsoft.Extensions.Options` in Application;
  the shared read-side record `ConnectionTestSummaryDto` + `ConnectionTestSummaryMapping` (used by T-0017..T-0020, so
  those tasks can run in parallel).
- Out: domain event dispatch changes (T-0013), any use case.

## Contract / design notes
Read ADR-0004, ADR-0008, ADR-0013 §4, BACKEND.md Persistence.

**Application ports** (`Application/Abstractions/Persistence/` unless noted)
```csharp
public interface IUserRepository {
    Task<User?> GetByIdAsync(UserId id, CancellationToken ct);
    Task<User?> GetByUsernameAsync(Username username, CancellationToken ct);
    Task<bool> ExistsAsync(Username username, CancellationToken ct);
    Task<int> CountActiveWritableAdminsAsync(CancellationToken ct);   // role admin (assignment OR config source), active, not read-only
    void Add(User user); }
public interface IClusterRepository {
    Task<Cluster?> GetByIdAsync(ClusterId id, CancellationToken ct);
    Task<Cluster?> GetByNameAsync(ClusterName name, CancellationToken ct);
    Task<IReadOnlyList<Cluster>> GetByNamesAsync(IReadOnlyCollection<ClusterName> names, CancellationToken ct);
    Task<bool> ExistsAsync(ClusterName name, CancellationToken ct);
    void Add(Cluster cluster); void Remove(Cluster cluster); }
public interface ICredentialRepository {
    Task<Credential?> GetByIdAsync(CredentialId id, CancellationToken ct);
    Task<IReadOnlyList<Credential>> GetByIdsAsync(IReadOnlyCollection<CredentialId> ids, CancellationToken ct);
    Task<bool> NameExistsAsync(ClusterId clusterId, CredentialName name, CancellationToken ct);
    Task<int> CountByClusterAsync(ClusterId clusterId, CancellationToken ct);
    void Add(Credential credential); void Remove(Credential credential); }
public interface IGrantRepository {
    Task<Grant?> GetByIdAsync(GrantId id, CancellationToken ct);
    Task<IReadOnlySet<ClusterId>> GetClusterIdsForUserAsync(UserId userId, CancellationToken ct);
    Task<int> CountByCredentialAsync(CredentialId id, CancellationToken ct);
    Task<int> CountByClusterAsync(ClusterId id, CancellationToken ct);
    void Add(Grant grant); void Remove(Grant grant); }
public interface IAuditEntryRepository { void Add(AuditEntry entry); }   // append-only (AUD-3): no update/remove
public sealed class ConcurrencyConflictException : Exception;   // thrown by IUnitOfWork on xmin mismatch
public sealed class DuplicateKeyException : Exception;          // thrown by IUnitOfWork on unique violation (SQLSTATE 23505)

// Application/Abstractions/IReadModel.cs — replace the placeholder
IQueryable<User> Users; IQueryable<Cluster> Clusters; IQueryable<Credential> Credentials; IQueryable<Grant> Grants;
IQueryable<AuditEntry> AuditEntries;          // all AsNoTracking()

// Application/Abstractions/ITokenProtector.cs
public interface ITokenProtector { EncryptedToken Protect(SensitiveString token); SensitiveString Unprotect(EncryptedToken token); }

// Application/Audit/IAuditTrail.cs — interface + record only; implementation in T-0013
public interface IAuditTrail { void Record(AuditRecord record); }
public sealed record AuditRecord(string Action, AuditTargetType TargetType, string? TargetId, string TargetName,
    string? ClusterName, string Summary, object? Details = null, AuditActor? Actor = null);   // Actor null = current user

// Application/Common/ConnectionTestSummaryDto.cs — contract §3, verbatim
public sealed record ConnectionTestSummaryDto(DateTimeOffset TestedAt, bool Succeeded, ConnectionTestStep? FailedStep, CapabilityLevel? Headline, bool IsStale);
// Application/Common/ConnectionTestSummaryMapping.cs — pure; IsStale = TestedAt < connectionSettingsChangedAt (CLU-4)
public static ConnectionTestSummaryDto? ToDto(ConnectionTestSummary? summary, DateTimeOffset connectionSettingsChangedAt);

// Application/Credentials/CredentialsOptions.cs  (section "Credentials")
public sealed class CredentialsOptions { public int ExpiryWarningDays { get; set; } = 14; public TimeSpan ConnectionTestTimeout { get; set; } = TimeSpan.FromSeconds(15); }
```
- `UnitOfWorkBehavior`: catch `ConcurrencyConflictException` → `Error.Conflict("Concurrency.Conflict", "This item was
  changed by someone else. Reload and try again.")`; `DuplicateKeyException` → `Error.Conflict("Persistence.DuplicateKey",
  "This item already exists. Reload and try again.")` via `FailureResult<TResponse>`. Handlers still do their own
  explicit version check first (resource-specific message, ADR-0013 §4).
- Allow `Microsoft.Extensions.Options` in Application: package reference, `ArchitectureTests` + `ProjectFileArchitectureTests`
  allow-lists, BACKEND.md table (architect already updated the doc).

**Infrastructure**
- One `IEntityTypeConfiguration` per aggregate in `Persistence/Configurations/`. Tables `users`, `clusters`,
  `credentials`, `grants`, `audit_entries`, `data_protection_keys`. Strongly typed id converters; value objects as
  converted columns or complex properties (`ApiServerEndpoint` → `api_url`, `ca_bundle`, `skip_tls_verify`;
  `TokenMetadata` → `token_type`, `token_subject`, `token_issued_at`, `token_expires_at`; `ConnectionTestSummary` →
  `last_test_*` nullable columns). Enums stored as strings. `users.groups` `text[]`. `audit_entries.details` `jsonb`.
- `Version` → `xmin` via `IsRowVersion()` on every aggregate.
- Constraints/indexes: unique `users.username`; unique `clusters.name`; unique `(credentials.cluster_id, name)`;
  unique `(grants.user_id, grants.cluster_id)`; index `grants.credential_id`; `audit_entries (occurred_at DESC, id DESC)`,
  `audit_entries.actor_name`, `audit_entries.cluster_name`.
- FKs: credentials→clusters **CASCADE**; grants→clusters **CASCADE**; grants→users **RESTRICT** (users are never
  deleted); grants→credentials **NO ACTION** (not RESTRICT: deleting a cluster cascades to both grants and credentials
  in one statement, and NO ACTION is checked at statement end). CLU-6 depends on this; test it.
- `ConsoleDbContext` implements `IDataProtectionKeyContext`; its `IUnitOfWork.SaveChangesAsync` translates
  `DbUpdateConcurrencyException` and `PostgresException { SqlState: "23505" }` into the two Application exceptions.
- Data Protection in `AddInfrastructure`: `AddDataProtection().SetApplicationName("FleetConsole")
  .PersistKeysToDbContext<ConsoleDbContext>()`; when `DataProtection:KeyEncryptionCertificatePath` is set, load the
  PFX (+ optional password file) and `ProtectKeysWithCertificate`; outside Development without it, log a startup
  warning (CP3 makes it mandatory). `DataProtectionTokenProtector` uses purpose `FleetConsole.Credentials.v1`.
  **From T-0011 (architect review, 2026-11-19):** the session cookie (`FleetConsole.Session`, T-0011) currently uses
  the default, non-persisted key ring, so sessions die on restart and can't be shared across replicas. The cookie
  handler resolves the app-wide `IDataProtectionProvider`, so this setup fixes it without touching `Api/Auth`; add a
  test that the cookie scheme's ticket protector comes from the persisted ring (e.g. a ticket issued by one host
  instance is accepted by a second instance over the same database).
- Repositories `internal sealed` in `Persistence/Repositories/`; `ReadModel` over the context with `AsNoTracking()`.
- Migration `IdentityAndAdministration` (one migration for all of CP1's model).

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- `ApiServerEndpoint` (complex property): its private constructor `(Uri url, CaBundle? caBundle, bool skipTlsVerify)`
  is bindable. Store `api_url` as the canonical text `endpoint.ToString()` / `Url.GetLeftPart(UriPartial.Authority)`
  (no trailing `/`, ≤ `ApiServerEndpoint.MaxUrlLength`), **not** `Uri.ToString()`, which appends `/`.
- `ca_bundle` (`text`, null): converter `bundle.Pem` ↔ `CaBundle.Create(pem).Value` (re-parses on materialization;
  ~40 rows, fine; a stored bundle that no longer parses is corrupt data and may throw). Do not map
  `CaBundle.Certificates`, `ApiServerEndpoint.TlsMode`, `TokenMetadata.ServiceAccount` or expiry status (derived).
- `EncryptedToken` → `bytea` (`t.Value` ↔ `new EncryptedToken(bytes)`; equality is byte-wise). `ClusterName`,
  `CredentialName`, `TokenFingerprint` ↔ `string` via `.Create(s).Value`. Column lengths from the constants
  `ClusterName.MaxLength` (40), `CredentialName.MaxLength` (63), `TokenFingerprint.Length` (8),
  `Cluster.MaxDisplayNameLength` (100), `Cluster.MaxDescriptionLength` / `Credential.MaxDescriptionLength` (1000),
  `Cluster.MaxWebConsoleUrlLength` (2048).
- `ConnectionTestSummaryMapping.ToDto` uses `summary.IsStaleSince(connectionSettingsChangedAt)`; don't re-implement it.
- Round-trip tests include a cluster with a CA bundle (generate the cert as `DomainTestData.CertificatePem` does) and
  a credential with a recorded `LastTest`.

## Acceptance criteria
- [ ] Integration tests (Testcontainers): round-trip of each aggregate incl. value objects and `Version`; unique
      constraints raise `DuplicateKeyException`; stale `xmin` raises `ConcurrencyConflictException`; deleting a cluster
      with credentials and grants removes all of them (CLU-6 cascade); deleting a credential still referenced fails.
- [ ] `UnitOfWorkBehavior` unit tests: both exceptions become 409 results with the codes above.
- [ ] CRED-2 (storage part): protect/unprotect round-trip through Data Protection with keys in Postgres; the
      `credentials.token` column bytes do not contain the plaintext token.
- [ ] `IReadModel` members documented (no-tracking, project to DTOs); `CountActiveWritableAdminsAsync` tested with
      config-sourced and assigned admins, read-only and deactivated users.
- [ ] `ConnectionTestSummaryMapping` unit test (null, fresh, stale).
- [ ] Migration generated with the documented command; model snapshot consistent (EF pending-changes guard passes).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
