---
id: T-0020
title: Connection test — step orchestration, capability check set, hints, test endpoints, recording
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0010, T-0017, T-0018]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting/, src/FleetConsole.Application/Credentials/TestCredential/, src/FleetConsole.Application/Credentials/TestToken/, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/, tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests/, web/src/shared/api/schema.gen.ts]
review_rounds: 1
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
- [x] Unit tests of `ConnectionTester` with a fake probe session: each headline level; step stop/skip rules; 401 →
      authentication failed and later steps skipped; ClusterVersion 403 → warning not failure; SelfSubjectReview 404 →
      SSAR-based authentication + identity from JWT `sub` (`tokenSubject`); timeout fails the running step; namespace
      rules included only when requested; TEST-4 hints (RW grants but no write; cluster-admin with RO grants).
- [x] QG-2 integration tests via `FakeKubeApiServer` (T-0010) through HTTP: success with CA bundle; unknown authority
      without bundle → step `reachability` failed `tlsUnknownAuthority` with the spec text; 401 token; disabled cluster
      still testable (TEST-1); last test stored on the credential and visible in `GET .../credentials` with
      `isStale: false`, then `true` after an API URL change (CLU-4); `credential.tested` / `credential.token_tested`
      audit entries; unsaved-token test changes nothing in the DB except the audit entry (TEST-5).
- [x] CRED-2: token absent from the result body, audit details and captured logs (`TokenLeakScanner`).
- [x] Read-only admin → 403 `Auth.ReadOnly`. `schema.gen.ts` regenerated *(deferred to orchestrator: worktree has no node_modules)*. Build, lint and tests green (rule 4).

## Contract amendments (orchestrator 2026-11-18)
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-20 backend-engineer: started; tester + check set + two commands + endpoints + tests.
- 2026-11-20 backend-engineer: done; `scripts/check-be.sh` green (580 Api tests incl. 9 new over FakeKubeApiServer + 33 unit).
  Outside paths (minimal): `AddScoped<ConnectionTester>()` in Application DI; probe-client substitute in test
  `ServiceProviderBuilder`; port record `ResourceRule` → `KubernetesResourceRule` (collided with `ResourceRuleDto`'s
  schema name, SchemaNamingTests). Grant counts read via `IReadModel` (avoids touching `IGrantRepository`, T-0019).

## Review
**Round 1 — backend-architect, 2026-11-20: APPROVE.** `scripts/check-be.sh` green (323/379/580). Step order, budget
(linked CTS; budget → running step `timeout`, caller abort propagates), contract §8.5 texts/check ids/headline rules and
§10 audit details match; CRED-2 scans cover body, audit, DB dump and logs for both actions; test-token only reaches
registered clusters and `inspectNamespace` is DNS-label validated before reaching the URL. Step rules beyond the ADR
(version 401/403 → warning, SSR 403 ≈ 404, JWT `sub` → passed) are accepted; add them to ADR-0011 at merge.
- Accepted deviation: grant counts via `IReadModel` in the command handlers — fine for a count. Follow-up (optional):
  after T-0019 merges, move `GrantModeCounts.ReadAsync` to `IGrantRepository.CountByModeAsync(CredentialId)` so the
  record stays a plain value.
- Optional nit: `TestCredentialHandler` can return 409 `Concurrency.Conflict` (rotation during a test; xmin bumps on
  `RecordTest`) — not in the contract §8.4 error column; add it there. FE must refetch the credential list after a test
  (version changes) before a rotate.
- Optional nit: `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs:58` — fully qualified
  `IClusterProbeClient`; prefer a `using`.

## Handover notes
- `ConnectionTester` (`Credentials/ConnectionTesting/`) owns step order, budget (linked CTS; budget timeout → running step
  `failed/timeout`, caller abort → OCE propagates), messages, capability evaluation and hints. `SummaryOf(result)` builds
  the stored/audited summary; `ConnectionOf(cluster)` maps the endpoint to the probe port.
- Step rules beyond the ADR: `/version` 401/403 → reachability `warning` (authentication decides); SSR 404 **or 403** →
  first SSAR decides authentication; identity from JWT `sub` is `passed` (source `tokenSubject`), none → `warning`;
  ClusterVersion 403/404 → warning, other failures fail; a failed rules review → capabilities `warning` (no `namespaceRules`).
- Failure messages: contract texts for `tlsUnknownAuthority`/`unauthorized`, otherwise the probe's own message.
- TEST-4 hint wording is grammatical for one user ("1 user has ReadWrite grants…").
- Endpoints: blank `inspectNamespace` is treated as none; `TestCredentialRequest` body is required (FE sends `{}`).
- `credential.token_tested` targets the cluster (TargetId = cluster id, TargetName = cluster name).
- Orchestrator: run `npm run gen:api` + `npm run typecheck` after merge (new schemas `ConnectionTestResult`, `ResourceRule`, …).
