---
id: T-0017
title: Admin clusters API — list, detail, register, update, enable/disable, delete
status: todo
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
- [ ] Integration tests for each endpoint: happy path, 400 (each rule of contract §8.2 incl. bad PEM, `http://` URL,
      URL with path, skip+CA), 404, 409 (`NameTaken`, `NotDisabled`, stale version).
- [ ] CLU-2 detail returns subject/issuer/expiry per CA cert (generated test certs incl. one expiring in < 30 days).
- [ ] CLU-4 API URL/CA/skip change marks seeded credential tests stale in list (`lastTest.isStale`); other edits don't.
- [ ] CLU-5 disable/enable keeps grants and credentials; CLU-6 delete removes credentials + grants and audits
      `cluster.deleted` with counts; CLU-7 list fields incl. `worstCredentialExpiryStatus`, `grantCount`, `tlsMode`.
- [ ] `cluster.updated` audit lists changed field names and never CA content (AUD-1).
- [ ] Read-only admin 403 on commands (ADM-2). `schema.gen.ts` regenerated. Build, lint and tests green (rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `ClusterListItemDto` gains `Version` (uint) — contract §8.1.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
