---
id: T-0012
title: Persistence for CP1 aggregates — EF mappings, migration, repositories, read model, Data Protection, conflict mapping
status: done
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
- [x] Integration tests (Testcontainers): round-trip of each aggregate incl. value objects and `Version`; unique
      constraints raise `DuplicateKeyException`; stale `xmin` raises `ConcurrencyConflictException`; deleting a cluster
      with credentials and grants removes all of them (CLU-6 cascade); deleting a credential still referenced fails.
- [x] `UnitOfWorkBehavior` unit tests: both exceptions become 409 results with the codes above.
- [x] CRED-2 (storage part): protect/unprotect round-trip through Data Protection with keys in Postgres; the
      `credentials.token` column bytes do not contain the plaintext token.
- [x] `IReadModel` members documented (no-tracking, project to DTOs); `CountActiveWritableAdminsAsync` tested with
      config-sourced and assigned admins, read-only and deactivated users.
- [x] `ConnectionTestSummaryMapping` unit test (null, fresh, stale).
- [x] Migration generated with the documented command; model snapshot consistent (EF pending-changes guard passes).
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator)
- `audit_entries` needs a nullable, indexed `related_username` column (contract §10 amendment 2026-11-19); the domain `AuditEntry` field is added by T-0013 — if T-0012 lands first, include the column in the single CP1 migration only if the domain property exists; otherwise T-0013 may add a second migration (allowed exception).

## Work log
- 2026-11-19 (backend-engineer): started. Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0004/0008/0009/0013,
  contract §3/§10/§12, handovers of T-0007/T-0008/T-0010/T-0011.

- 2026-11-19 (backend-engineer): implemented.
  - Application: ports in `Abstractions/Persistence/` (4 repositories + append-only `IAuditEntryRepository`,
    `ConcurrencyConflictException`, `DuplicateKeyException` with `ConstraintName` + `ForConstraint` factory,
    `PersistenceErrors`), `IReadModel`, `ITokenProtector`, `Audit/IAuditTrail.cs` (interface + `AuditRecord`),
    `Common/ConnectionTestSummary{Dto,Mapping}`, `Credentials/CredentialsOptions` (+ `SectionName`,
    `ExpiryWarningWindow`). `UnitOfWorkBehavior` maps both exceptions to 409 via `FailureResult<TResponse>`.
    `Microsoft.Extensions.Options` 10.0.0 added (central), allowed in both architecture tests.
  - Infrastructure: converters registered by type in `ConsoleDbContext.ConfigureConventions` (ids, single-value VOs
    through their `Create` factories, `EncryptedToken` → bytea, `CaBundle` → PEM, all enums → text);
    `Persistence/Configurations/` (one per aggregate + `data_protection_keys`, shared `MapAggregateRoot` with
    `Version` → `xmin`); `Persistence/Repositories/`; `ReadModel`; `Crypto/` (`DataProtectionSetup`,
    `DataProtectionTokenProtector`, `UnprotectedKeyRingWarning`, EventId 3200); `AddInfrastructure` registers all of
    it plus validated `CredentialsOptions`. `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore` 10.0.14 (MIT).
  - Migration `20261118220227_IdentityAndAdministration` generated with the documented command (the CP0 `Initial`
    stays; this is the only CP1 migration). `has-pending-model-changes`: none.
  - **Deviations / decisions (please review):**
    1. `IReadModel` also has `ToListAsync`, `FirstOrDefaultAsync`, `CountAsync`, `AnyAsync`. The contract listed only the
       five queryables, but Application can't reference EF Core, so without these, query handlers could only enumerate
       synchronously (blocking I/O, against "async all the way"). Infrastructure delegates to EF; handler-test fakes
       can run them with LINQ to Objects.
    2. `AuditActor` is an **owned type** (same table, `actor_*` columns), not a complex property: EF Core 10 can't
       index complex-type columns and `actor_name` needs an index. Other VOs (`ApiServerEndpoint`, `TokenMetadata`,
       optional `ConnectionTestSummary`) are complex properties as specified.
    3. Data Protection's EF key repository calls **synchronous** `SaveChanges()`, which the T-0004 guard refused
       (every key creation failed). The guard now refuses sync saves only when anything other than
       `DataProtectionKey` rows is pending. `PersistenceModelTests` updated; one sentence in BACKEND.md (Persistence)
       corrected (outside `paths`, a doc fix only).
    4. The migrator is registered before `AddDataProtection` so it starts before Data Protection's hosted service,
       which loads the key ring.
    5. `web_console_url` stores `Uri.OriginalString` (round-trips exactly, within the validated 2048 length).
       `api_url` stores the canonical text as specified.
    6. `fk_grants_users_user_id` is named explicitly (the convention produced `fk_grants_user_user_id`).
    7. `ConnectionTestSummaryMappingTests` live in `tests/FleetConsole.Application.Tests/Common/` (outside `paths`; the
       criterion requires the test, and `Behaviors/` is the wrong place).
  - **Contract amendment (orchestrator message, 2026-11-19):** added `AuditEntry.RelatedUsername` (nullable, optional
    last parameter `relatedUsername` of `AuditEntry.Record`, blank → null) with domain tests, mapped to nullable
    `related_username` + `ix_audit_entries_related_username`, included in the single CP1 migration. T-0013 populates
    it.
  - Tests: Api.Tests/Persistence `AggregateRoundTripTests`, `ConstraintAndConcurrencyTests`,
    `RepositoryAndReadModelTests`, `TokenProtectionTests`, `DataProtectionKeyRingTests` (a session ticket protected by
    host A is accepted by a second host over the same DB and rejected by a host over a fresh DB; same for SA tokens),
    `DataProtectionSetupTests` (no DB: repository type, PFX + password file encrypt/decrypt, missing private key fails,
    warning outside Development). Application.Tests: 5 new `UnitOfWorkBehaviorTests` cases, mapping tests.
  - Checks: `dotnet build FleetConsole.slnx -warnaserror` → 0 warnings; `dotnet test FleetConsole.slnx` (podman,
    Testcontainers) → Domain 323, Application 73, Api 260, all passed; `dotnet ef migrations has-pending-model-changes`
    → "No changes have been made to the model since the last migration."

## Review
**Round 1 — backend-architect, 2026-11-19: APPROVE**

Checks run by the reviewer (podman, Testcontainers): `dotnet build FleetConsole.slnx -warnaserror` gave 0 warnings
and 0 errors. `dotnet test FleetConsole.slnx` passed Domain 323, Application 73 and Api 260.
`dotnet ef migrations has-pending-model-changes` reported "No changes have been made to the model since the last
migration."

Migration (reviewed with `dotnet ef migrations script Initial IdentityAndAdministration`):
- Tables and columns are all snake_case. `xmin` is mapped as a `rowVersion` on all five aggregates and is not created
  as a real column.
- `details` is `jsonb`, `groups` is `text[]`, `token` is `bytea`, and enums are stored as text.
- Lengths come from the Domain constants: 40, 63, 8, 100, 1000, 2048 and `Username.MaxLength` (253) for `*_by`.
- Unique indexes: `ix_users_username`, `ix_clusters_name`, `ix_credentials_cluster_id_name`,
  `ix_grants_user_id_cluster_id`.
- Audit indexes: `(occurred_at DESC, id DESC)`, `actor_name`, `cluster_name`, `related_username`.
- Grant indexes: `credential_id`, plus `cluster_id` for the cascade and `CountByClusterAsync`.
- Foreign keys: credentials→clusters CASCADE, grants→clusters CASCADE, grants→credentials NO ACTION, grants→users
  RESTRICT.

Matches the contract. Leaving audit text columns unbounded is deliberate and documented in
`AuditEntryConfiguration`.

Security:
- Tokens reach the database only as Data Protection ciphertext. The test scans the column bytes for the token and
  for UTF-8 and UTF-16 prefixes of it.
- The purpose is isolated and tampering is rejected.
- Plaintext buffers are zeroed.
- No `EnableSensitiveDataLogging`. The exception messages carry no values (the Npgsql `Detail` stays on the inner
  exception, which is swallowed into a Result).
- The key ring is persisted, and the session cookie uses it, which the two-host test proves.
- The PFX and password file load correctly, and a certificate without a private key fails at startup.
- Outside Development, without a certificate, the EventId 3200 warning is registered, which the test checks for
  Production and Staging.

Rulings on the deviations:
1. **`IReadModel` async operators:** accepted. Application can't reference EF Core, and synchronous enumeration
   would break "async all the way". Fakes stay trivial with LINQ to Objects. BACKEND.md "Use case folder convention"
   now documents this (architect doc fix).
2. **Owned `AuditActor`:** accepted. EF Core 10 can't index complex-type columns, and `actor_name` must be indexed.
   The columns are the same (`actor_*`, same table). Queries are no-tracking, so projecting `a.Actor` works.
   BACKEND.md Persistence now records the rule: complex properties by default, an owned type only where a column
   needs an index (architect doc fix).
3. **Synchronous `SaveChanges` for `DataProtectionKey`-only saves:** accepted. `EntityFrameworkCoreXmlRepository`
   only saves synchronously, and the guard still refuses every other pending entry. Both cases are tested, and
   BACKEND.md is correct. Carried into T-0013 as a constraint.
4. **Migrator registered before Data Protection:** accepted. Hosted services start sequentially in registration
   order, and the comment explains the coupling. It only matters in Development. Production migrates through a job
   before rollout.
5. **`web_console_url` as entered:** accepted. The Domain validates `OriginalString.Length` against
   `MaxWebConsoleUrlLength`, so storage and validation measure the same string and the URL round-trips exactly.
   `api_url` stays canonical as specified.
6. **Explicit `fk_grants_users_user_id`:** accepted. It keeps FK names uniform (`fk_<table>_<principal table>_<column>`).
7. **23001 on user delete:** accepted. RESTRICT (immediate check, `restrict_violation`) is what the contract asked
   for. Users are never deleted, so this is a bug guard, and the test pins the SQLSTATE.
8. **Untranslated FK failure (500): ruling.** `DuplicateKeyException` is already generic (any 23505). For FKs, every
   23503 that CP1 can produce is a lost race against a concurrent delete or insert:
   - a credential deleted while a grant using it is created;
   - a cluster deleted while a credential or grant is added to it.

   The client action is the same as for a stale version, so 23503 will be translated into
   `ConcurrencyConflictException`, which returns the existing 409 `Concurrency.Conflict`. This adds no new public
   code. 23001 stays a 500 because it means a bug. T-0012 implemented its contract correctly, so this doesn't block
   approval. The change goes to **T-0013**, which already owns `ConsoleDbContext.SaveChangesAsync` and these tests;
   its contract and acceptance criteria are updated. The orchestrator needs to amend the contract §2
   `Concurrency.Conflict` row: "stale `version`, or a commit-time race with a concurrent change or delete".

Deviation 7 in the work log (mapping tests in `tests/FleetConsole.Application.Tests/Common/`) is fine.

The T-0013 follow-ups are captured in T-0013 under "From T-0012":
- `AuditRecord.RelatedUsername` and how to populate it.
- Keep the commit-translation wrapper, and don't translate exceptions from event handlers.
- 23503 → `ConcurrencyConflictException`.
- The sync `SaveChanges` constraint.
- Don't reuse a context after a failed commit.

T-0013's `paths` now includes `ConcurrencyConflictException.cs`.

Optional, non-blocking:
- `src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs`: `LoadCertificate` checks `HasPrivateKey` but not
  that the key is RSA. A non-RSA PFX fails only on the first key creation, not at startup. Add `GetRSAPrivateKey()
  is null → throw` when the setup is next touched (CP3).
- CP3 (for the orchestrator's roadmap/handover):
  - turn warning 3200 into a startup error;
  - support rotating the key-encryption certificate (`UnprotectKeysWithAnyCertificate` with the previous
    certificate), or keys encrypted with the old certificate become unreadable;
  - document both in the ops runbook (ADR-0004).
- `tests/FleetConsole.Api.Tests/Persistence/DataProtectionSetupTests.cs`: asserts that the warning service is
  registered, not that it logs. Acceptable; a `CapturedLogs` assertion would be stronger.

## Handover notes
- **Ports:** `Application/Abstractions/Persistence/*`, `Abstractions/{IReadModel,ITokenProtector}.cs`,
  `Audit/IAuditTrail.cs`, `Common/ConnectionTestSummary{Dto,Mapping}.cs`, `Credentials/CredentialsOptions.cs`. Inject
  `IOptions<CredentialsOptions>`; it is bound and validated by `AddInfrastructure` (section `Credentials`).
- **Queries (T-0016..T-0021):** compose from `IReadModel` queryables and execute with `readModel.ToListAsync(query, ct)`
  etc. Never `.ToList()`. Compare value objects whole (`c.Name == name`, `names.Contains(c.Name)`), not via `.Value`.
  Derived members (`User.Role/Status/IsActiveWritableAdmin`, `TlsMode`, `CaBundle.Certificates`,
  `TokenMetadata.ServiceAccount`, expiry status) are not columns. Spell the role out
  (`u.IsAdminByAssignment || u.AdminConfigurationSource != null`) or derive it in memory after projecting the VOs.
  Selecting whole value objects (`c.Endpoint`, `cr.LastTest`) in a projection works. Join by id (see
  `RepositoryAndReadModelTests.ReadModel_JoinsAggregatesById`).
- **Commit races:** `IUnitOfWork` throws `ConcurrencyConflictException` (stale `xmin`, also on delete) and
  `DuplicateKeyException` (23505, `ConstraintName` like `ix_users_username`); `UnitOfWorkBehavior` returns 409
  `Concurrency.Conflict` / `Persistence.DuplicateKey`. A **foreign-key** failure (deleting a credential still used, 23503)
  is not translated yet and would be a 500; T-0013 translates 23503 into `ConcurrencyConflictException` (architect
  ruling, see Review). Handlers must still check `CountByCredentialAsync` first (CRED-6).
- **Constraint names:** `ix_users_username`, `ix_clusters_name`, `ix_credentials_cluster_id_name`,
  `ix_grants_user_id_cluster_id`. FKs: `fk_credentials_clusters_cluster_id` (cascade), `fk_grants_clusters_cluster_id`
  (cascade), `fk_grants_credentials_credential_id` (NO ACTION), `fk_grants_users_user_id` (RESTRICT → SQLSTATE 23001).
- **T-0013:** `ConsoleDbContext.SaveChangesAsync` is still post-commit dispatch (unchanged). The explicit
  `IUnitOfWork.SaveChangesAsync` wraps it with the exception translation; keep that wrapper when moving dispatch
  pre-commit. The sync `SaveChanges` override must keep allowing `DataProtectionKey`-only saves. Populate
  `AuditEntry.RelatedUsername` (target user for `user.*`, grant user for `grant.*`). The `user` filter is then
  `actor_name = @u OR related_username = @u` (both indexed).
- **Data Protection:** `SetApplicationName("FleetConsole")`, keys in `data_protection_keys`; the session cookie uses the
  same ring (proved by `DataProtectionKeyRingTests`), so sessions survive restarts/replicas. Optional
  `DataProtection:KeyEncryptionCertificatePath` (+ `...PasswordPath`, trailing newline trimmed) must be an RSA PFX with
  private key. Otherwise warning EventId 3200 outside Development. Token protector purpose `FleetConsole.Credentials.v1`;
  plaintext byte buffers zeroed.
- **Follow-ups:** (a) BACKEND.md/contract could mention `IReadModel`'s async operators and the owned `AuditActor`
  (architect). (b) 23503 → 409: decided, moved to T-0013. (c) CP3: turn the
  key-ring warning into a startup error. (d) Many idle MSBuild node-reuse processes from parallel sessions are running on the machine.
  I stopped only three idle ones that matched my build times.
