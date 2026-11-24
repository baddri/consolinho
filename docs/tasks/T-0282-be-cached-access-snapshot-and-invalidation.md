---
id: T-0282
title: Cache the per-user access snapshot and invalidate it after commit; BACKEND.md cache recipe
status: todo
owner: backend-engineer
checkpoint: 4.5b
depends_on: [T-0280, T-0281, T-0283]
paths: [src/FleetConsole.Application/Access/, src/FleetConsole.Application/Proxy/AuthorizeProxyRequest/, src/FleetConsole.Application/Clusters/ListAccessibleClusters/, src/FleetConsole.Application/Users/GetEffectiveAccess/, src/FleetConsole.Application/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Access/, tests/FleetConsole.Application.Tests/Proxy/AuthorizeProxyRequest/, tests/FleetConsole.Application.Tests/Users/, tests/FleetConsole.Api.Tests/Caching/, docs/architecture/BACKEND.md]
review_rounds: 0
---

## Goal
CACHE-1/2/4: the proxy, the cluster switcher and Effective access read the user's access through one cached query;
grant/user/cluster/credential events and membership changes invalidate it after commit (ADR-0040 §4–5). CACHE-8:
BACKEND.md documents keys, tags and events.

## Scope
- In: `LoadAccessSnapshotQuery` (+ handler = today's SQL), `ClusterAccessReader` reworked to resolve per request from
  the snapshot, invalidation post-commit handler, coverage test, BACKEND.md.
- Out: cache machinery (T-0281), post-commit stage (T-0280), 503 (T-0283), QG-4 two-instance/Redis-scan tests (T-0285),
  the host group snapshot (stays per process, ADR-0040 Consequences). No API/OpenAPI change, no FE change.

## Contract / design notes
```csharp
// Application/Access/LoadAccessSnapshot/LoadAccessSnapshotQuery.cs — internal, not IRequireAuthenticated (only the reader sends it)
internal sealed record LoadAccessSnapshotQuery(UserId UserId) : ICacheableQuery<AccessSnapshot>
{
    public string CacheKey => $"access:v1:user:{UserId.Value}";        // bump v1 on any AccessSnapshot shape change
    public IReadOnlyCollection<string> TagsFor(AccessSnapshot s);      // user:{id}; cluster:/credential: of every row;
}                                                                      // group: of every s.UserGroups entry
// AccessSnapshot: primitives only (Guid/string/bool/int/byte[] or string ciphertext) — System.Text.Json round-trip.
internal sealed record AccessSnapshot(bool UserFound, string Username, bool UserIsReadOnly,
    IReadOnlyList<string> UserGroups, IReadOnlyList<AccessSnapshotRow> Rows);
internal sealed record AccessSnapshotRow(Guid ClusterId, string ClusterName, string ClusterDisplayName, bool ClusterIsEnabled,
    string Environment, string Distribution, /* endpoint url, CA pem, skipTlsVerify */ string? WebConsoleUrl,
    Guid GrantId, string? GroupName, int? Priority, string AccessMode, Guid CredentialId, string CredentialName,
    /* EncryptedToken ciphertext as stored */ ...);
```
- Handler = the current `ClusterAccessReader` statement **without** the `IsEnabled` and single-cluster filters (rows for
  disabled clusters are kept with `ClusterIsEnabled`, so `cluster:{id}` tags exist for `ClusterEnabled`; ADR-0040 §4).
  Deactivated users still yield no rows. Registered with `services.AddCacheableQuery<LoadAccessSnapshotQuery, AccessSnapshot>()`.
- `ClusterAccessReader.LoadAsync(userId, cluster?, sessionIsReadOnly, ct)` keeps its signature and result
  (`ResolvedClusterAccess`): it sends the query through `IDispatcher`, filters enabled (+ named) clusters, maps rows back
  to value objects and runs `AccessResolver` + the tie log per request. The three callers stay unchanged apart from
  comments (verify `AuthorizeProxyRequestHandler` still decrypts only the winner, after policies — no decrypted token
  in any cached type).
- CACHE-5 (T-0283): the snapshot handler queries only through `IReadModel` terminal operators (no repository/`DbContext`), so an outage surfaces as `PersistenceUnavailableException` → 503; the cache must not catch it or serve stale.
- `Application/Access/AccessCacheInvalidation.cs`: one class implementing `IPostCommitDomainEventHandler<T>` for each
  event below, calling `IQueryCache.RemoveByTagsAsync` with `CacheTags.*`:

  | Events | Tag |
  |---|---|
  | `GrantCreated`, `GrantChanged`, `GrantRevoked` | `user:{UserId}` when `UserId` is set, else `group:{SubjectName}` |
  | `UserDeactivated`, `UserReactivated`, `UserReadOnlyChanged`, `UserGroupsChanged`, `UserLoggedIn` | `user:{UserId}` |
  | `ClusterUpdated`, `ClusterEnabled`, `ClusterDisabled`, `ClusterDeleted` | `cluster:{ClusterId}` |
  | `CredentialRotated`, `CredentialDeleted` | `credential:{CredentialId}` |
  | not access-relevant (allow-list with a reason each): `ClusterRegistered`, `CredentialAdded`, `CredentialTested`, `UserCreated`, `UserProvisioned`, `UserRoleChanged` | — |
- Coverage test (like the audit coverage test, ADR-0008 §5): every concrete `IDomainEvent` is either handled by
  `AccessCacheInvalidation` or in its commented allow-list — a new event can't silently skip invalidation.
- BACKEND.md (CACHE-8): replace §Recipes "Adding a cache later" with "Caching a query" (`ICacheableQuery`,
  `AddCacheableQuery`, `CacheTags`, key versioning, post-commit invalidation handler, coverage test) + the table above +
  key `access:v1:user:{id}`; Pipeline step 5 (no longer "future"); §The proxy last paragraph ("No access cache in CP2")
  → one authorization statement per cache miss, `Cache:Duration`; §Hosting: `ConnectionStrings:redis`, `Cache:Duration`,
  `redis` health Degraded. Keep each change short.

## Context pack
- Docs: ADR-0040 §3–5; ADR-0034 §2 (precedence); BACKEND.md §Recipes (L218–228), §The proxy (L184–217).
- Exemplars: `Application/Access/ClusterAccessReader.cs:LoadAsync` (L40–90, the statement to move into the handler)
  and `Resolve` (stays in the reader); `Application/Audit/EventHandlers/ClusterAuditHandler.cs` (one class, many events).
  Audit coverage test: `grep -rn "not audited" tests/` for the reflection-test pattern.
- Touch points: `ResolvedClusterAccess.cs:L28` (unchanged shape), `AuthorizeProxyRequestHandler.cs:Handle` (L54, L80–82),
  `ListAccessibleClustersHandler.cs` L32, `GetEffectiveAccessHandler.cs` L55, `Application/DependencyInjection.cs` L58
  (reader registration), domain events in `Domain/{Access,Users,Clusters,Credentials}/Events/`.
- Tests: `tests/.../Proxy/AuthorizeProxyRequest/AuthorizeProxyRequestHandlerTests.cs` (fakes of `IReadModel`; add a
  pass-through fake `IQueryCache` or dispatch through a real `Dispatcher` with L1-only cache).

## Acceptance criteria
- [ ] Handler/reader tests: PREC behaviour unchanged (existing tests green); disabled cluster filtered on read; session
      read-only applied per request without a reload; tags computed as specified.
- [ ] Api integration (L1-only, one instance): proxy request warms the cache; a second request issues no SQL for access
      (count via EF interceptor or `CapturedLogs`); revoke the grant → next proxy request is refused without waiting
      (CACHE-2); same for a group grant revoke (`group:` tag), `UserGroupsChanged`, credential rotate (new token used)
      and cluster disable.
- [ ] TTL backstop: with `Cache:Duration` short and invalidation suppressed (test double), access heals after expiry (CACHE-4).
- [ ] Coverage test for events; `AccessSnapshot` JSON round-trip test.
- [ ] BACKEND.md updated as above (CACHE-8); XML docs; `scripts/check-be.sh` green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
