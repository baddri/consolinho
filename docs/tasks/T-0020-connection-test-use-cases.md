---
id: T-0020
title: Connection test — step orchestration, capability check set, hints, test endpoints, recording
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0010, T-0017, T-0018]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting/, src/FleetConsole.Application/Credentials/TestCredential/, src/FleetConsole.Application/Credentials/TestToken/, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/, tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Let an admin test a (cluster, credential) or an unsaved token and get the five-step result with a capability summary
and grant-mode hints (TEST-1..5), using the probe client of T-0010. **Wave W7** (last on the critical path).

## Scope
- In: `ConnectionTester`, `CapabilityCheckSet`, `TestCredentialCommand`, `TestTokenCommand`, the two endpoints,
  result DTOs (contract §8.5), recording + audit, integration tests over `FakeKubeApiServer`.
- Out: scheduled tests, notifications (backlog).

## Contract / design notes
Read ADR-0011 completely; contract §3 (enums), §8.4 (routes, requests), §8.5 (result records, messages, check ids,
hints), §10 (`credential.tested`, `credential.token_tested`).

```csharp
// Application/Credentials/ConnectionTesting/
internal sealed class ConnectionTester(IClusterProbeClient probes, IClock clock, IOptions<CredentialsOptions> options)
{   Task<ConnectionTestResultDto> RunAsync(ClusterConnection connection, SensitiveString token,
        TokenMetadata tokenMetadata, string? inspectNamespace, GrantModeCounts? grants, CancellationToken ct); }
public sealed record GrantModeCounts(int ReadOnly, int ReadWrite);              // null for unsaved tokens without credentialId
public static class CapabilityCheckSet
{   public static IReadOnlyList<CapabilityCheck> Checks { get; }                // ids/labels per contract §8.5, in order
    public static CapabilityLevel Evaluate(IReadOnlyDictionary<string, bool> allowedById, bool clusterAdmin); }
public sealed record CapabilityCheck(string Id, string Label, CapabilityCategory Category, ResourceAttributes Attributes);

// TestCredential/  (IAdminRequest, IMutatingCommand — it records the last test)
public sealed record TestCredentialCommand(string ClusterName, Guid CredentialId, string? InspectNamespace) : ICommand<ConnectionTestResultDto>;
// TestToken/       (IAdminRequest, IMutatingCommand — audited, stores nothing on aggregates)
public sealed record TestTokenCommand(string ClusterName, SensitiveString Token, Guid? CredentialId, string? InspectNamespace) : ICommand<ConnectionTestResultDto>;
```
- `CapabilityCategory`, `ConnectionTestStepStatus`, `HintSeverity`, `IdentitySource` enums and the result records
  live in `ConnectionTesting/` (Application); `ConnectionTestStep`, `CapabilityLevel` come from Domain (T-0008).
- Cluster-admin check is the SSAR `verb=* group=* resource=*`; it is not one of the listed checks but drives the headline.
- `TestCredential`: load cluster + credential (404s), `ITokenProtector.Unprotect`, grant counts by mode for that
  credential, run, `credential.RecordTest(summary, cluster.Name)` → `CredentialTested` → audit (ADR-0008).
  The step outcome is a **successful** `Result` even when the test failed.
- `TestToken`: trimmed token validated like CRED-1; `credentialId` (optional) must belong to the cluster (400 field
  error) and supplies grant counts and, for identity fallback, nothing else; `TokenInspector` gives metadata for the
  JWT `sub` fallback; record `credential.token_tested` via `IAuditTrail` with the fingerprint (never the token).
- Endpoints added to `CredentialsAdminEndpoints.cs`: `POST /api/admin/clusters/{name}/credentials/{credentialId}/test`
  (OperationId `TestCredential`), `POST /api/admin/clusters/{name}/test-token` (OperationId `TestToken`).
  Timeout comes from `CredentialsOptions.ConnectionTestTimeout`; also honour the request-aborted token.

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- `credential.RecordTest(summary, cluster.Name.Value)` replaces `LastTest` and raises `CredentialTested` on every
  call; it throws if `Succeeded` disagrees with `FailedStep is null` (build the summary from the result consistently).
  `isStale` → `ConnectionTestSummary.IsStaleSince(cluster.ConnectionSettingsChangedAt)`.

**From T-0015 (architect review, 2026-11-19)** — the integration-test harness (`tests/FleetConsole.Api.Tests/Integration/`).
See T-0015's handover notes for details.
- Test classes use `[Collection(ApiCollectionDefinition.Name)]` and take the shared `ApiFactory factory`. Tests in the
  collection run sequentially over **one shared database**, so use unique names (the helpers generate them) and never
  assume an empty table.
- **Logging in:** `await factory.LoginAsAsync(username)` returns a browser client (cookies, no auto-redirect,
  `X-Console-Request: 1`) that holds a session. Users must exist in the emulator. Use `factory.NewUsername()` for a
  regular user and `factory.NewAdminUsername()` for an admin **by configuration** (group `fleetconsole-admins`; can't be
  demoted → 409 `Users.AdminViaConfiguration`). For an admin **by assignment**, first
  `var u = await factory.Data.UserAsync(role: UserRole.Admin)`, then `LoginAsAsync(u.Username)`. For a read-only admin,
  add `isReadOnly: true`. Shipped users (`admin/alice/bob/ines`) are shared by all tests: use them for read-only
  assertions only.
- **Seeding below HTTP:** `factory.Data` (`TestData`): `UserAsync`, `DeactivateAsync`, `ReactivateAsync`,
  `SetReadOnlyAsync`, `SetRoleAsync`, `ClusterAsync`, `CredentialAsync` (encrypted via `ITokenProtector`; returns the
  plaintext token for CRED-2 scans), `GrantAsync`, `FindUserAsync`, `AuditEntriesAsync(name)`. Each call saves in its own
  signed-in scope (actor `test-data`), so seeding writes audit entries too. Filter audit assertions by name or action.
- **Other configuration** (e.g. `Auth:RevalidationInterval=00:00:00` so a role/read-only change is visible on the next
  request): `await using var host = await factory.CreateVariantAsync(overrides)` gives its own database and emulator.
  Each variant costs a migration run (~1 s). Create it once per class (`IAsyncLifetime`), not per test.
- **Secret leaks (CRED-2):** `TokenLeakScanner.AssertAbsent(secret, haystacks...)` over response bodies,
  `await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, ct)` (plaintext must not be in the DB) and
  `factory.Logs.AllText` (Debug and above).
- **Errors through HTTP:** assert `status`, `application/problem+json` and `code` (e.g. 401 `Auth.Unauthenticated`
  without a session, 403 `Auth.Forbidden` for non-admins, 403 `Auth.CsrfHeaderMissing` when the header is removed).
- After adding endpoints, regenerate `web/src/shared/api/schema.gen.ts` (`cd web && npm run gen:api`, Api running) and
  run `npm run typecheck` (ADR-0016).

## Acceptance criteria
- [ ] Unit tests of `ConnectionTester` with a fake probe session: each headline level; step stop/skip rules; 401 →
      authentication failed and later steps skipped; ClusterVersion 403 → warning not failure; SelfSubjectReview 404 →
      SSAR-based authentication + identity from JWT `sub` (`tokenSubject`); timeout fails the running step; namespace
      rules included only when requested; TEST-4 hints (RW grants but no write; cluster-admin with RO grants).
- [ ] QG-2 integration tests via `FakeKubeApiServer` (T-0010) through HTTP: success with CA bundle; unknown authority
      without bundle → step `reachability` failed `tlsUnknownAuthority` with the spec text; 401 token; disabled cluster
      still testable (TEST-1); last test stored on the credential and visible in `GET .../credentials` with
      `isStale: false`, then `true` after an API URL change (CLU-4); `credential.tested` / `credential.token_tested`
      audit entries; unsaved-token test changes nothing in the DB except the audit entry (TEST-5).
- [ ] CRED-2: token absent from the result body, audit details and captured logs (`TokenLeakScanner`).
- [ ] Read-only admin → 403 `Auth.ReadOnly`. `schema.gen.ts` regenerated. Build, lint and tests green (rule 4).

## Contract amendments (orchestrator 2026-11-18)
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
