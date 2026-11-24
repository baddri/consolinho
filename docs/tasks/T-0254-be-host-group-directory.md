---
id: T-0254
title: Host group directory — list host Groups through FleetConsole's host SA (snapshot, fail-safe off)
status: done
owner: backend-engineer
checkpoint: 4.5a
depends_on: []          # wave 1, parallel with T-0250 and T-0251
paths: [src/FleetConsole.Application/Abstractions/Kubernetes, src/FleetConsole.Application/Auth, src/FleetConsole.Infrastructure/Identity, src/FleetConsole.Infrastructure/DependencyInjection.cs, src/FleetConsole.DevOAuth, src/FleetConsole.AppHost, src/FleetConsole.Api/appsettings*.json, tests/FleetConsole.Api.Tests/Integration, tests/FleetConsole.Api.Tests/Identity, tests/FleetConsole.Application.Tests]
review_rounds: 1
---

## Goal
One port that answers "which groups exist on the host and who is in them" (ADR-0039 §1/§2/§5), for the group picker
and Groups pages (T-0256) and for revalidation (T-0255). Never stale beyond `MaxSnapshotAge`; failures are values.

## Scope
- In: port + records, Infrastructure adapter with snapshot, options + validation, DevOAuth `groups` endpoint, AppHost
  wiring of the dev token, test hook to change emulator membership at runtime.
- Out: consumers (T-0255, T-0256); kustomize RBAC (T-0258).

## Contract / design notes
Application (`Abstractions/Kubernetes/IHostGroupDirectory.cs`):
```csharp
public interface IHostGroupDirectory
{
    /// Never throws for host problems (only for cancellation); never returns data older than MaxSnapshotAge.
    Task<HostGroupListing> GetAsync(CancellationToken cancellationToken);
}
public enum HostGroupsStatus { Ok, Forbidden, Unavailable }      // camelCase on the wire (contract §1)
public sealed record HostGroup(string Name, IReadOnlyList<string> Users);
public sealed record HostGroupListing(HostGroupsStatus Status, DateTimeOffset? ReadAt, IReadOnlyList<HostGroup> Groups)
{   // Groups empty unless Ok; system:* groups removed by the adapter
    public IReadOnlyList<string> GroupsOf(string username);       // ordinal match on Users, sorted
}
```
Infrastructure (`Identity/OpenShiftHostGroupDirectory.cs`, singleton):
- `GET {Auth:OpenShift:HostApiServerUrl}/apis/user.openshift.io/v1/groups?limit=500` and follow `metadata.continue`;
  `Authorization: Bearer <SA token>`; client `OpenShiftHostHttpClient.Name` (same trust, no retries, 10 s timeout).
  DTO: `items[].metadata.name`, `items[].users` (null → empty).
- Snapshot: refresh when `now - ReadAt >= MaxSnapshotAge`; single-flight (`SemaphoreSlim`, callers awaiting the same
  refresh share its result); a failed refresh **discards** the old snapshot for that call (fail-safe off) and the next
  call retries. 401/403 → `Forbidden`; anything else (network, 5xx, timeout, bad JSON, token file missing, no
  `HostApiServerUrl`) → `Unavailable`. Log once per status transition (no group names/users in logs).
- Token: read the file at `TokenPath` on every refresh (projected tokens rotate) into a `SensitiveString`; never log it.
- Options `HostGroupsOptions` section **`Auth:HostGroups`**: `TokenPath` (default
  `/var/run/secrets/fleetconsole/host/token`), `Token` (inline; **Development only**, refused elsewhere by the options
  validator like `SkipTlsVerify`), `MaxSnapshotAge` (default `00:00:15`, > 0, ≤ 5 min). Token wins over TokenPath.
- DevOAuth: `GET /apis/user.openshift.io/v1/groups` — groups derived from `DevOAuth:Users[].Groups` (no virtual
  groups), requires `Authorization: Bearer {DevOAuth:GroupsReaderToken}` (else 401), supports `limit`/`continue`
  (simple offset token). Membership comes from a singleton `DevGroupMembership` store seeded from options, with
  `SetGroups(username, groups)` used by tests (PREC-1 test in T-0255) — tests reach it via
  `TestOAuthServer.Services`.
- AppHost: one fake dev value (e.g. `dev-groups-reader-token-not-a-secret`) passed as `Auth__HostGroups__Token`
  to the Api and `DevOAuth__GroupsReaderToken` to the emulator. Test host configuration sets the same pair.

## Context pack
- Docs: ADR-0039, ADR-0034 §5; `SECURITY.md` §Authentication (L6-35, host TLS bullet); `BACKEND.md` §Hosting (L281-300).
- Exemplars: `Infrastructure/Identity/OpenShiftUserClient.cs:GetCurrentUserAsync` L34-60 (host call + failure mapping,
  `Log` class L109); `Identity/OpenShiftHostOptions.cs` + `OpenShiftHostOptionsValidator.cs` (Development-only rule);
  `DevOAuth/Endpoints/CurrentUserEndpoint.cs` (emulator endpoint style).
- Touch points: `Identity/IdentityServiceCollectionExtensions.cs` L47 (register next to `IExternalIdentityClient`);
  `Application/Auth/OpenShiftGroups.cs:IsVirtual`; `AppHost` env wiring L26-31; `tests/.../Integration/OpenShiftHostStub.cs`
  (Unreachable flag → `Unavailable`), `TestHostConfiguration.cs`, `TestOAuthServer.cs` L83-87.

## Acceptance criteria
- [x] Integration (Api.Tests via the stub): Ok listing with members; paging across 2 pages; 403 → `Forbidden`; unreachable → `Unavailable`; `system:*` filtered.
- [x] Snapshot tests (fake clock + fake handler): reused within `MaxSnapshotAge`; refreshed after; failed refresh never returns old data; concurrent callers → one host request.
- [x] Token file re-read per refresh; inline `Token` refused outside Development (options validation test); token never logged (`TokenLeakScanner` if applicable).
- [ ] (partial, see Work log) `aspire run`: the emulator's groups list is served to the Api (manual check noted in Work log).
- [x] XML docs; `scripts/check-be.sh` green.

## Work log
- 2026-11-24 backend-engineer: started; port + adapter + options, DevOAuth groups endpoint, AppHost wiring, tests.
- 2026-11-24 backend-engineer: done; check-be green (339/715/880). Snapshot unit tests live in `tests/FleetConsole.Api.Tests/Identity/`
  (outside `paths`: that is where the identity-adapter test host lives). Manual: emulator run standalone with the AppHost's
  token env → `groups?limit=2` pages with `continue`, no token → 401. Full `aspire run` not exercised (shared ports);
  AppHost wiring compiles, Api side covered by Integration tests with the same token pair.
- 2026-11-24 backend-engineer: review r1 fix — removed duplicated `DevGroupMembership` registration in
  `DevOAuthServiceCollectionExtensions`; slnx build -warnaserror clean, HostGroup tests 22 + 4 green.

## Review
Round 1 — backend-architect, 2026-11-24: **CHANGES_REQUESTED** (1 required, 0 optional). Affected tests re-run: Api 22/22, Application 4/4; build -warnaserror clean.
- src/FleetConsole.DevOAuth/DevOAuthServiceCollectionExtensions.cs:32-37 — `DevGroupMembership` is registered twice (copy-pasted block incl. comment); the first registration is dead and a reader can't tell which instance tests/endpoints get — delete one block.
- Verified OK (no action): fail-safe off (failed refresh replaces snapshot, `IsFresh` only for Ok + age in [0, MaxAge), slow-refresh rule, cancellation not cached); token only in `Authorization` via `SensitiveString`, logs carry type name/status only, `TokenLeakScanner` in unit + integration tests, fake tokens in AppHost/tests; `system:*` dropped via `OpenShiftGroups.IsVirtual`; validator (Dev-only inline token, 0 < MaxAge ≤ 5 min, messages name keys only); singleton + `IHttpClientFactory`; XML docs complete.
- AC (3) `aspire run`: accepted as is — the Api↔emulator path is exercised by Integration tests against the real DevOAuth app with the same token pair; AppHost adds only two env vars. QA's CP4.5a smoke covers the live run. Test placement in `Api.Tests/Identity` accepted; added to `paths`.

## Handover notes
- Port: `Application/Abstractions/Kubernetes/{IHostGroupDirectory,HostGroupListing}.cs`; adapter `Infrastructure/Identity/OpenShiftHostGroupDirectory.cs`
  registered in `AddOpenShiftIdentity` (singleton) with `HostGroupsOptions` (`Auth:HostGroups`) + validator.
- Single-flight: waiters share the refresh they waited for (Ok or failure); a later caller retries a failure (not cached).
- Extra strictness: a refresh that itself takes ≥ `MaxSnapshotAge` returns `Unavailable` (its data would already be too old).
  `ReadAt` = refresh start. Failed listings have `ReadAt = null`.
- Logs: EventId 3320 (readable, group count) / 3321 (Forbidden/Unavailable + reason), once per transition; no names/tokens.
- DevOAuth: `GET /apis/user.openshift.io/v1/groups` (reader token `DevOAuth:GroupsReaderToken`, `limit`/`continue`=offset);
  `DevGroupMembership` (public, singleton) with `SetGroups`; tests: `TestOAuthServer.GroupMembership` (use a variant or pool user).
- Tests: `TestHostConfiguration.GroupsReaderToken` pair; `Offline()` clears the inline token (Production hosts);
  `OpenShiftHostStub.GroupsEndpointStatus` / `GroupsRequests`.
- Enum wire casing (camelCase) is the consumer's job (T-0256 DTO mapping).
