---
id: T-0019
title: Grants API (single, bulk, change, revoke, per-user/per-cluster lists) and GET /api/clusters for the switcher
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Grants/, src/FleetConsole.Application/Clusters/ListAccessibleClusters/, src/FleetConsole.Api/Endpoints/Admin/GrantsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/GrantRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, src/FleetConsole.Api/Endpoints/ClustersEndpoints.cs, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, tests/FleetConsole.Application.Tests/Grants/, tests/FleetConsole.Api.Tests/Integration/Admin/Grants/, tests/FleetConsole.Api.Tests/Integration/Clusters/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Let admins connect users to clusters through credentials (GRANT-1..6), including the all-or-nothing bulk grant, and
give every user the list of clusters they may switch to (SW-1). **Wave W6** — parallel with T-0016/T-0017/T-0018/T-0021
(max 3 agents at once; worktrees).

## Scope
- In: contract §9 (all grant routes incl. `GET /api/admin/users/{username}/grants`,
  `GET /api/admin/clusters/{name}/grants`, bulk) and §6 (`GET /api/clusters`).
- Out: anything about the proxy (CP2).

## Contract / design notes
Contract §2, §6, §9. Domain `Grant.Create/Change/Revoke` (T-0008). Application folder `Application/Grants/` (Domain
folder is `Access/`; the feature is called "grants" everywhere in the UI and API).

| Use case | Request | Response |
|---|---|---|
| `ListUserGrants` | `ListUserGrantsQuery(string Username)` | `IReadOnlyList<GrantDto>` |
| `ListClusterGrants` | `ListClusterGrantsQuery(string ClusterName)` | `IReadOnlyList<GrantDto>` |
| `CreateGrant` | `CreateGrantCommand(string Username, string ClusterName, Guid CredentialId, AccessMode AccessMode)` | `GrantDto` |
| `BulkGrant` | `BulkGrantCommand(string Username, AccessMode AccessMode, IReadOnlyList<BulkGrantItem> Items)` | `IReadOnlyList<GrantDto>` (command returns the ids; endpoint re-queries via a `GetGrantsByIdsQuery`, request order) |
| `UpdateGrant` | `UpdateGrantCommand(Guid GrantId, AccessMode AccessMode, Guid CredentialId, uint Version)` | `GrantDto` |
| `RevokeGrant` | `RevokeGrantCommand(Guid GrantId)` | `Result` |
| `ListAccessibleClusters` (`Application/Clusters/ListAccessibleClusters/`) | `ListAccessibleClustersQuery : IRequireAuthenticated` | `IReadOnlyList<AccessibleClusterDto>` |

> **Response shapes (ADR-0013 §5):** the "Response" column is what the *endpoint* returns. Commands return only the key
> (`Result<string>` username/name, `Result<Guid>` id) or `Result`; the endpoint then dispatches the matching `Get…`
> query so `version` is the post-commit value.

- Body references → **400 field errors** (contract §9.3); `Grants.AlreadyExists` is 409 on single create, a field
  error `items[i].clusterName` on bulk (§9.4). Build field errors as `ValidationError` from the handler (keys in C#
  path form `Items[3].ClusterName`; the Api camelCases them).
- Bulk: load user once, clusters via `GetByNamesAsync`, credentials via `GetByIdsAsync`, existing grant cluster ids
  once; validate every item, collect **all** item errors, return them together; only if none, create all grants (one
  `GrantCreated` each → one audit entry each, ADR-0008). Max 100 items, unique cluster names (validator).
- `ListAccessibleClusters`: enabled clusters with a grant for the current user who is active; `accessMode` is the
  effective mode (`readOnly` if `currentUser.IsReadOnly`); sorted by environment enum order then name. One SQL query.
- Endpoints: `GrantsAdminEndpoints.cs` (tag `Grants`; OperationIds `ListUserGrants`, `ListClusterGrants`,
  `CreateGrant`, `BulkGrant`, `UpdateGrant`, `RevokeGrant`); `ClustersEndpoints.cs` at `/api/clusters` (tag
  `Clusters`, OperationId `ListMyClusters`) mapped from `ApiEndpoints`.

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- `Grant.Create` returns `CredentialNotInCluster` before `AlreadyExists`. For bulk, pass the existing cluster ids
  **plus** the clusters of earlier items of the same request. The bulk field message ("alice already has access to
  prod-eu-1.") differs from the `GrantErrors.AlreadyExists(...)` message — build it in the handler.
- `Change(mode, newCredential, labels, ...)`: `labels.CredentialName` is the **current** (old) credential's name. No
  change → no event, no audit entry.

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
- [x] GRANT-1: second grant 409 `Grants.AlreadyExists` with the spec message; credential of another cluster → 400
      on `credentialId`; unknown user/cluster/credential → 400 field errors.
- [x] GRANT-3: change mode/credential (+ stale version 409), revoke 204, both audited with old→new details.
- [x] GRANT-4: bulk success writes N grants + N audit entries; one bad item → 400 listing every bad item by index and
      **nothing** written (assert DB and audit count unchanged).
- [x] GRANT-5: grants of disabled clusters, deactivated users, expired credentials still listed with
      `clusterIsEnabled`/`userStatus`/`credentialExpiryStatus` reflecting it. GRANT-6: admin without grants gets `[]`
      from `/api/clusters`.
- [x] SW-1: `/api/clusters` filters disabled clusters and deactivated users, applies effective mode for globally
      read-only users, sorts production→staging→development then name, exposes no API URL/CA/credential fields
      (assert JSON property set); 401 anonymous.
- [x] CRED-2: `TokenLeakScanner` (T-0015) run over grant responses. Read-only admin 403 on commands.
- [x] `schema.gen.ts` regenerated. Build, lint and tests green (rule 4). (BE green; FE typecheck red only in stale `schema.test.ts:16`, see Work log.)

## Contract amendments (orchestrator 2026-11-18)
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-20 backend-engineer: started; Application/Grants use cases + GrantProjection, endpoints, tests.
- 2026-11-20 backend-engineer: done. Added `GetGrantQuery` (single re-query for create/update) beside `GetGrantsByIdsQuery`.
  Bulk atomicity = one `SaveChanges` (already one transaction), no explicit transaction needed. `schema.gen.ts`
  regenerated; `npm run typecheck` fails only in `web/src/shared/api/schema.test.ts:16` (asserts `/api/clusters` is still
  contract-only; now generated) — FE test needs updating, not an Api deviation. check-be green (594 Api tests).

## Review
- 2026-11-20 backend-architect, round 1: **APPROVE**. check-be green (323/370/594). Engineer notes accepted: one
  `SaveChanges` = one transaction with the audit rows; bulk stages grants only after all items pass (test asserts DB +
  audit unchanged); unique/FK races → 409 via `UnitOfWorkBehavior`; row version backs the pre-check; stricter effective
  mode matches contract §6 ("grant readOnly OR user globally read-only"); `BulkGrantItem` reuse is documented.
  Optional nits (no re-review):
  - `src/FleetConsole.Application/Grants/BulkGrant/BulkGrantHandler.cs:101` — `else` assumes any other `Grant.Create`
    failure is AlreadyExists; match `GrantErrors.AlreadyExists` code explicitly and return the error otherwise.
  - `src/FleetConsole.Api/Endpoints/ClustersEndpoints.cs:200` — add `ArgumentNullException.ThrowIfNull(api)` like the
    sibling mappers.

## Handover notes
- Application: `Grants/{ListUserGrants,ListClusterGrants,GetGrant,GetGrantsByIds,CreateGrant,BulkGrant,UpdateGrant,RevokeGrant}`;
  `GrantProjection` = one SQL statement (grants⋈users⋈clusters⋈credentials), expiry status/test staleness in memory.
  `GrantLookup` holds field messages, `ConcurrencyConflict`, audit labels (3 repo reads by id for change/revoke).
- Field errors are built in handlers as `ValidationError` (C# paths `Items[3].ClusterName`); create collects all three
  unknown references at once; `CredentialNotInCluster` → field error, `AlreadyExists` → 409 (single) / item field (bulk).
- `BulkGrantItem` lives in `Application/Grants/BulkGrant/BulkGrantCommand.cs` and is reused by the Api's
  `BulkGrantRequest`, so the OpenAPI document has exactly one `BulkGrantItem` schema (contract name).
- Lists sort ordinally in memory: user grants by cluster name, cluster grants by username (contract is silent).
- `/api/clusters` effective mode is readOnly if grant, session (`ICurrentUser.IsReadOnly`) **or** stored user is
  read-only (stricter of the two, visible before session revalidation). Deactivated users filtered in SQL too.
- Validator: duplicate clusters marked on 2nd+ occurrence (`items[i].clusterName` "Cluster listed twice.").
- FE follow-up: `web/src/shared/api/schema.test.ts:16` must switch `/api/clusters` to `Gen.paths` (or another
  not-yet-generated path) — left untouched per scope.
