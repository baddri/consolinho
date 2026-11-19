---
id: T-0017
title: Admin clusters API — list, detail, register, update, enable/disable, delete
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Clusters/, src/FleetConsole.Api/Endpoints/Admin/ClustersAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/ClusterRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Clusters/, tests/FleetConsole.Api.Tests/Integration/Admin/Clusters/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Cluster registration and maintenance for admins (CLU-1..8 API side), including CA certificate summaries, TLS mode,
credential expiry roll-up and last-test roll-up for the list. **Wave W6** (critical path → T-0020), parallel with
T-0016, T-0018.

## Scope
- In: contract §8.1–§8.2 cluster routes except `/{name}/grants` (T-0019) and `/{name}/credentials` (T-0018).
  Use the shared `ConnectionTestSummaryDto`/`ConnectionTestSummaryMapping` from T-0012 (`Application/Common/`).
- Out: credentials, grants, connection testing.

## Contract / design notes
Contract §3, §8.1, §8.2 (records, validation, semantics). ADR-0013. Domain from T-0008.

| Use case (`Application/Clusters/...`) | Request | Response |
|---|---|---|
| `ListClusters` | `ListClustersQuery` | `IReadOnlyList<ClusterListItemDto>` |
| `GetCluster` | `GetClusterQuery(string Name)` | `ClusterDetailDto` |
| `RegisterCluster` | `RegisterClusterCommand(Name, DisplayName?, ApiUrl, Environment, WebConsoleUrl?, Description?, CaBundle?, SkipTlsVerify, IsEnabled)` | `ClusterDetailDto` |
| `UpdateCluster` | `UpdateClusterCommand(Name, DisplayName?, ApiUrl, Environment, WebConsoleUrl?, Description?, CaBundle?, SkipTlsVerify, uint Version)` | `ClusterDetailDto` |
| `EnableCluster` / `DisableCluster` | `...Command(string Name, uint Version)` | `ClusterDetailDto` |
| `DeleteCluster` | `DeleteClusterCommand(string Name)` | `Result` (204) |

> **Response shapes (ADR-0013 §5):** the "Response" column is what the *endpoint* returns. Commands return only the key
> (`Result<string>` username/name, `Result<Guid>` id) or `Result`; the endpoint then dispatches the matching `Get…`
> query so `version` is the post-commit value.

- Validators map value-object rules to field errors with the JSON keys of contract §8.2; the aggregate/VO factories stay
  the source of truth (validator may call `ApiServerEndpoint.Create` and copy its errors — don't duplicate regexes).
- `ListClusters`: one query (projections with correlated subqueries or a grouped join), no N+1; worst expiry needs
  `TokenMetadata.StatusAt` — project raw expiry/type columns and compute status in memory with `IClock` +
  `CredentialsOptions` (40 clusters × few credentials — fine). `LastTest` = newest credential test; `isStale` =
  `testedAt < connectionSettingsChangedAt`.
- `GetCluster`: `CaCertificates` from the stored PEM (parse via `CaBundle`), status window 30 days.
- `DeleteCluster`: counts via repositories → `cluster.MarkForDeletion(credentialCount, grantCount)` → `Remove`; DB
  cascade removes credentials and grants (T-0012). Audit entry carries the counts.
- Endpoints `ClustersAdminEndpoints.cs`, tag `Clusters`; OperationIds `ListClusters`, `RegisterCluster`, `GetCluster`,
  `UpdateCluster`, `EnableCluster`, `DisableCluster`, `DeleteCluster`. Version mismatch message "This cluster was
  changed by someone else. Reload and try again."

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- Validators: `name` → `ClusterName.Create` (plain `Clusters.InvalidName`; put its message on `name`). Connection
  fields → `ApiServerEndpoint.Create(apiUrl, caBundle, skipTlsVerify)`: on failure copy its `ValidationError.Errors`
  as-is (keys are already `apiUrl` / `caBundle` / `skipTlsVerify`). It enforces https-only (T-0010 relies on it) and
  two rules beyond the contract text: a CA bundle containing a `PRIVATE KEY` block is refused, and the 256 KiB limit is
  in UTF-8 bytes. Add 400 tests for the private-key case and an undecodable `CERTIFICATE` block.
- `webConsoleUrl` (absolute https, ≤ 2048), `displayName` (≤ 100) and `description` (≤ 1000) **must** be rejected by
  the validator: `Cluster.Register/Update` throw (`ArgumentException`) on them as programming errors.
- `apiUrl` in DTOs = `cluster.Endpoint.ToString()` (or the stored column, already canonical) — never `Url.ToString()`.
- `Update` with identical values raises no event (no audit entry) but is still a 200 with the current detail.
- `CertificateExpiryStatus` is not in the Domain: compute it in the `GetCluster` query from `CaCertificateInfo.NotAfter`
  with the 30-day window, same boundaries as `TokenMetadata.StatusAt` (`notAfter <= now` expired,
  `notAfter - now <= window` expiringSoon). `isStale` → `ConnectionTestSummary.IsStaleSince`.

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
- [x] Integration tests for each endpoint: happy path, 400 (each rule of contract §8.2 incl. bad PEM, `http://` URL,
      URL with path, skip+CA), 404, 409 (`NameTaken`, `NotDisabled`, stale version).
- [x] CLU-2 detail returns subject/issuer/expiry per CA cert (generated test certs incl. one expiring in < 30 days).
- [x] CLU-4 API URL/CA/skip change marks seeded credential tests stale in list (`lastTest.isStale`); other edits don't.
- [x] CLU-5 disable/enable keeps grants and credentials; CLU-6 delete removes credentials + grants and audits
      `cluster.deleted` with counts; CLU-7 list fields incl. `worstCredentialExpiryStatus`, `grantCount`, `tlsMode`.
- [x] `cluster.updated` audit lists changed field names and never CA content (AUD-1).
- [ ] Read-only admin 403 on commands (ADM-2) ✔. Build and tests green ✔. `schema.gen.ts` **not** regenerated (orchestrator
      regenerates after merge; worktree has no node_modules).

## Contract amendments (orchestrator 2026-11-18)
- `ClusterListItemDto` gains `Version` (uint) — contract §8.1.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-19 backend-engineer: started in worktree `agent-a9928235423746737` (b1f8062); read docs, contract §8.1–8.2, T-0012/T-0015 notes.
- 2026-11-19 backend-engineer: interrupted mid-task (Application layer partly written); resumed same day.
- 2026-11-19 backend-engineer: finished Enable/Disable/Delete, `ClustersAdminEndpoints.cs` + `ClusterRequests.cs`, one call in
  `AdminEndpoints.cs`; unit + 70 integration tests. Outside `paths`: `Application.Tests/ServiceProviderBuilder.cs` registers the
  cluster/credential/grant repository fakes (validate-on-build). `check-be.sh` green.

## Review
**Round 1 — backend-architect, 2026-11-20: APPROVE.** `check-be.sh` green (323/242/492). Contract §8.1/8.2 met; CA
validation via `ApiServerEndpoint.Create` (private key / bad PEM tested); audit and logs carry no CA content (LoggingBehavior
logs only names/codes); delete pre-check + cascade + counts tested; no-op transitions/updates write no audit; version check +
xmin; list and detail are single EF statements. `[JsonRequired] environment` → codeless framework 400 is consistent with
contract §1 ("framework 400s … have no `code`") and marks the field required in OpenAPI — accepted.
Merge hazards (orchestrator, when merging onto `cp/1-identity-admin`, which already has T-0016 + T-0018):
- `src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs:30` — conflicts with the Users + Credentials lines — keep all three calls.
- `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs:50-53` — T-0018 registers the same three ports (+ `ITokenProtector`) — merge into one block (keep `InMemoryClusterRepository`, one substitute each, `ITokenProtector`); don't leave duplicate registrations.
- Emulator admin pool (60) is now shared by users + credentials + clusters tests — run the full `check-be.sh` after the merge.
Optional nits:
- `tests/.../Admin/Clusters/ClusterTestSupport.cs:148` — fingerprint derivation duplicated; after merge use T-0018's `TokenFingerprints.Compute`.
- `src/FleetConsole.Application/Clusters/ListClusters/ListClustersHandler.cs:35` — projecting `c.Endpoint` materializes and X.509-parses every CA bundle per list call; projecting `Url`/`SkipTlsVerify`/`CaBundle != null` would avoid it (fine at ~40 clusters).
- `tests/.../Admin/Clusters/RegisterClusterTests.cs:139` — private-key test could also assert the key line is absent from `factory.Logs.AllText`.
- `src/FleetConsole.Application/Clusters/DisableCluster/DisableClusterCommand.cs:6` — summary line not wrapped like its siblings.

## Handover notes
**State:** in_review, `check-be.sh` green (Domain 323, Application 242, Api 492). Not committed. `schema.gen.ts` not regenerated.
- **Decisions:** `environment` is `[JsonRequired]` on both request records → missing/unknown value = 400 ProblemDetails from body
  binding (no `code`/`errors`, like other malformed bodies), never a silent `production` default. Schema stays non-nullable.
  `displayName`/`description`/`webConsoleUrl` are trimmed (contract silent; blank → null); length limits apply after trimming.
  `webConsoleUrl` is returned as entered (`Uri.OriginalString`, no added trailing `/`). Enable/disable on a cluster already in
  that state = 200, no audit entry (Domain no-op).
- **EF:** the list projection (grant-count subquery + nested credential collection with complex `Metadata`/`LastTest`) translates;
  proven by `ClusterQueriesTests` against Postgres (EF throws on client evaluation).
- **Tests:** `Integration/Admin/Clusters/ClusterTestSupport.cs` shares ONE writable admin and ONE read-only admin per factory
  (emulator admin pool is 60 for the whole collection; per-test admins exhausted it) and seeds grantees as offline users. Also has
  JWT-credential and `RecordTest` seeding helpers T-0018 may reuse.
- **Merge:** `AdminEndpoints.cs` gets one line `admin.MapClustersAdminEndpoints();` (T-0016 adds its users line next to it);
  `ServiceProviderBuilder.cs` +3 registrations (T-0016/T-0018 may touch the same block).
- **Follow-ups for orchestrator:** regenerate `schema.gen.ts` + `npm run typecheck` after merge.
