---
id: T-0253
title: Proxy authorization and accessible clusters resolve through AccessResolver (one SQL statement each)
status: done
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0250, T-0251]   # wave 2, parallel with T-0252, T-0255, T-0258
paths: [src/FleetConsole.Application/Access, src/FleetConsole.Application/Proxy/AuthorizeProxyRequest, src/FleetConsole.Application/Clusters/ListAccessibleClusters, tests/FleetConsole.Application.Tests, tests/FleetConsole.Api.Tests/Integration/Proxy, tests/FleetConsole.Api.Tests/Integration/Clusters]
review_rounds: 0
---

## Goal
Group grants give access: the proxy and the cluster switcher pick the winning grant with the shared resolver
(PREC-2..8), still with **one authorization query per proxy request** (ADR-0019) and no host calls (PREC-1). The
loader is the seam CP4.5b caches (ADR-0035; BACKEND.md §Recipes "Adding a cache later").

## Scope
- In: `ClusterAccessReader` (internal), rewiring `AuthorizeProxyRequestHandler` and `ListAccessibleClustersHandler`.
- Out: caching (CP4.5b); Effective access (T-0257 reuses the reader); policies unchanged.

## Contract / design notes
`Application/Access/ClusterAccessReader.cs` (internal, scoped, registered in `AddApplication`):
```csharp
internal sealed class ClusterAccessReader(IReadModel readModel)
{
    /// One SQL statement: candidate grants of the user on enabled clusters (optionally only `cluster`), joined with
    /// user (active), cluster and credential. Candidate = g.UserId == userId
    ///   || (g.SubjectKind == Group && u.Groups.Contains(g.GroupName))   // text[] → "= ANY(u.groups)"
    Task<IReadOnlyList<ResolvedClusterAccess>> LoadAsync(UserId userId, ClusterName? cluster, bool sessionIsReadOnly, CancellationToken ct);
}
internal sealed record ResolvedClusterAccess(
    ClusterId ClusterId, ClusterName ClusterName, string ClusterDisplayName, ClusterEnvironment Environment,
    ClusterDistribution Distribution, ApiServerEndpoint Endpoint, string? WebConsoleUrl,
    string Username, bool StoredUserIsReadOnly, AccessResolution Resolution,
    EncryptedToken WinnerToken, string WinnerCredentialName);
```
- Rows are grouped by cluster in memory and resolved with `AccessResolver.Resolve(candidates, user.Groups,
  stored || sessionIsReadOnly)`; clusters with `null` resolution are dropped. Select the encrypted token per candidate
  row (a few rows), keep only the winner's — **decrypt only in `AuthorizeProxyRequestHandler`**, only the winner.
- `TieDetected` → log warning (source-generated `LoggerMessage`, cluster + grant ids only) in the reader (PREC-5).
- Verify the generated SQL uses `= ANY` on the `groups` array and is a single statement (log/`ToQueryString` in a test).
- `AuthorizeProxyRequestHandler`: replace the query L50-67 with `reader.LoadAsync(userId, clusterName,
  currentUser.IsReadOnly)`; empty → `ProxyErrors.NotAvailable` (same indistinguishable cases, PRX-2);
  `ProxyRequestContext` gets the winner's mode and the effective read-only flag as today. Update the remarks.
- `ListAccessibleClustersHandler`: `LoadAsync(userId, null, currentUser.IsReadOnly)` → `AccessibleClusterDto`
  with `Resolution.EffectiveMode`; DTO shape unchanged.
- Leave a `<remarks>` note on the reader: "CP4.5b wraps this in `ResolveClusterAccessQuery` (ADR-0035)".

## Context pack
- Docs: ADR-0019, ADR-0034 §2/§4; `BACKEND.md` §The proxy (L184-217), §Recipes "Adding a cache later" (L220-228).
- Exemplars: `Proxy/AuthorizeProxyRequest/AuthorizeProxyRequestHandler.cs:Handle` (current single query);
  `Clusters/ListAccessibleClusters/ListAccessibleClustersHandler.cs:Handle` L23-55.
- Touch points: `Domain/Access/Resolution/AccessResolver.cs` (T-0251), `Grant.SubjectKind/GroupName` (T-0250),
  `Infrastructure/Persistence/Configurations/UserConfiguration.cs` L30 (`Groups` is a primitive collection → `text[]`).
- Tests: proxy integration tests under `tests/FleetConsole.Api.Tests/Integration/Proxy/` (pick one for the fixture
  pattern); user groups come from the DevOAuth user config (`TestOAuthServer` L83-87).

## Acceptance criteria
- [x] PREC-2: auto-provisioned member of a granted group sees the cluster in `GET /api/clusters` and can proxy GET.
- [x] PREC-3/4/5/6 through the proxy: direct RO beats group RW (mutation → 403 via MutationGuard); higher priority's credential is used; RO flag narrows.
- [x] PREC-7: disabled user/cluster, missing credential behave as today for group-derived access (same `Proxy.NotAvailable`).
- [x] ADR-0019: one SQL statement per authorization (test via EF command interceptor/counter, as existing tests do if any; else `ToQueryString`).
- [x] Existing proxy and switcher tests unchanged and green; `scripts/check-be.sh` green.

## Work log
- 2026-11-24 backend-engineer: `ClusterAccessReader` + `ResolvedClusterAccess` (one statement, `g.group_name::text = ANY (u.groups)`,
  grouped + `AccessResolver`, tie warning EventId 2600); both handlers rewired; DI in `AddApplication`. Outside paths:
  `Domain/Access/GroupName.cs` got an explicit `string` operator — EF can't translate `.Value` on a converted column and the
  `(string)` cast must also run in memory for the handler unit tests. Group grants in integration tests are seeded below HTTP
  (T-0252 owns the endpoints); `scripts/check-be.sh` green.

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. Single statement with `= ANY (u.groups)` asserted by interceptor
  test; BitmapOr-able via `grants.user_id`/`group_name` indexes. Only the winner's token is decrypted, after policies
  (unit test asserts it). RO flag narrows via resolver + `StoredUserIsReadOnly || session`; `system:*` dropped by
  `AccessResolver` (defence in depth, Domain table tests); all PREC-7 denials collapse to `Proxy.NotAvailable`.
  `ClusterAccessReader` exposes only Domain types, no EF leakage. `GroupName` explicit `(string)` operator: accepted —
  framework-free, null-guarded, documented; a reasonable value-object conversion, not an EF dependency in Domain.
  check-be: build ok; 1 failure `ProxyStreamLifetimeTests.Followed_Log_…` (timeout under suite load, passes in isolation,
  unrelated to this diff).
  Optional: `AuthorizeProxyRequestHandler.cs:2` — `using …Application.Access` sits between `Abstractions` usings (sort).
  Optional: handler-level test with a stored `system:authenticated` group grant + membership → NotAvailable (QG-3 at the seam).
  Follow-up (T-0255): `UserConfiguration` comment "groups never queried by element" is now stale.

## Handover notes
- Reader: `src/FleetConsole.Application/Access/ClusterAccessReader.cs` (`LoadAsync(userId, cluster?, sessionIsReadOnly)`);
  T-0257 (Effective access) and CP4.5b's `ResolveClusterAccessQuery` should wrap it, not copy the query.
- Query = users ⨯ grants (direct OR group in `u.groups`) ⋈ enabled clusters ⋈ credentials; one row per candidate,
  only the winner's encrypted token kept; decryption stays in `AuthorizeProxyRequestHandler` (winner only).
- Policies get the winner's own `AccessMode` + stored||session RO flag, so MutationGuard still tells grant RO from user RO.
- `GroupName` explicit `(string)` operator exists for query translation (see its doc); don't replace with `.Value` in queries.
- Login groups come from `users/~`, which the DevOAuth emulator serves from *config* only (not `DevGroupMembership`);
  `ProxyGroupGrantTests` therefore uses a pool admin (configured `fleetconsole-admins`) for the real-login PREC-2 path
  and stores membership after login for the rest. SQL-count test uses a `DbCommandInterceptor` via `ConfigureDbContext`.
- Stale comment (outside paths, T-0255 owns the file): `UserConfiguration` says groups are "never queried by element" — now
  they are (`= ANY`); fix with T-0255. No GIN index needed: the array is read from the single user row.
