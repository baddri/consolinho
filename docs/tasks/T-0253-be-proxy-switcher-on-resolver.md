---
id: T-0253
title: Proxy authorization and accessible clusters resolve through AccessResolver (one SQL statement each)
status: todo
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
- [ ] PREC-2: auto-provisioned member of a granted group sees the cluster in `GET /api/clusters` and can proxy GET.
- [ ] PREC-3/4/5/6 through the proxy: direct RO beats group RW (mutation → 403 via MutationGuard); higher priority's credential is used; RO flag narrows.
- [ ] PREC-7: disabled user/cluster, missing credential behave as today for group-derived access (same `Proxy.NotAvailable`).
- [ ] ADR-0019: one SQL statement per authorization (test via EF command interceptor/counter, as existing tests do if any; else `ToQueryString`).
- [ ] Existing proxy and switcher tests unchanged and green; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
