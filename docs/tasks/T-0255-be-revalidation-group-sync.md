---
id: T-0255
title: Session revalidation re-reads group membership from the host; fails closed (PREC-1, ADR-0039)
status: done
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0250, T-0254]   # wave 2
paths: [src/FleetConsole.Application/Auth, src/FleetConsole.Application/Abstractions/Persistence, src/FleetConsole.Application/Abstractions/IReadModel.cs, src/FleetConsole.Api/Auth, src/FleetConsole.Infrastructure/Persistence, tests/FleetConsole.Application.Tests/Auth, tests/FleetConsole.Api.Tests/Integration/SessionRevalidationTests.cs]
review_rounds: 1
---

## Goal
A user removed from a host group loses that group's clusters within `RevalidationInterval + MaxSnapshotAge`
(PREC-1), without storing user tokens and without per-request host calls; when the host can't be read, sessions whose
access could depend on stale groups end (ADR-0009 fail-closed, ADR-0039 §3).

## Scope
- In: `SyncUserGroupsCommand`, `user_group_checks` table + recorder + read-model set, `SessionValidator` step,
  `CompleteLogin` records the check time.
- Out: Effective access display (T-0257 reads `user_group_checks`).

## Contract / design notes
- `Application/Auth/SyncUserGroups/{SyncUserGroupsCommand,SyncUserGroupsHandler}.cs`:
  `public sealed record SyncUserGroupsCommand(UserId UserId) : ICommand;` — **not** `IRequireAuthenticated`, **not**
  `IAdminRequest`, **not** `IMutatingCommand` (read-only users must sync); never mapped to an endpoint (same rule as
  `GetSessionStateQuery`, ADR-0009). No validator (typed id).
- Handler: load user (repository); `listing = await directory.GetAsync(ct)`;
  - `Ok` → `user.ReplaceGroups(OpenShiftGroups.WithoutVirtualGroups(listing.GroupsOf(user.Username.Value)))`;
    `recorder.RecordAsync(user.Id, listing.ReadAt!.Value, ct)`; success. (UnitOfWorkBehavior saves the aggregate and
    the `user.groups_changed` audit entry from T-0250.)
  - not `Ok` → if `readModel.Grants.Any(g => g.SubjectKind == Group && user.Groups.Contains(g.GroupName))` →
    `AuthErrors.GroupsUnavailable` (`Auth.GroupsUnavailable`, Unavailable/Failure type); else success without changes.
- `IUserGroupCheckRecorder.RecordAsync(UserId, DateTimeOffset checkedAt, CancellationToken)` (port in
  `Abstractions/Persistence`); Infrastructure: `INSERT ... ON CONFLICT (user_id) DO UPDATE SET checked_at = ...`
  (`ExecuteSqlInterpolatedAsync`), outside the aggregate so `users.xmin` doesn't change (ADR-0039 §4).
  Table `user_group_checks(user_id uuid PK FK→users RESTRICT, checked_at timestamptz not null)`; mapped as a keyed
  non-aggregate entity `UserGroupCheck(UserId, CheckedAt)` and exposed read-only as `IReadModel.UserGroupChecks`.
  Migration `UserGroupChecks`.
- `SessionValidator.ValidateAsync`: after the state check passes (L77-85) and before `ReplacePrincipal`, dispatch
  `SyncUserGroupsCommand(state.UserId)`; failure → `Log.SessionEnded(..., "host groups unavailable")` + `RejectAsync`.
  Update the class remarks and ADR reference. Interval logic unchanged.
- `CompleteLogin` handler: after `RecordLogin` succeeds, `recorder.RecordAsync(user.Id, now, ct)` (login read `users/~`).
- No group names in logs. Docs: update `SECURITY.md` §Authentication revalidation bullet (groups re-read via host SA,
  fail-closed rule) — architect-owned text, keep it to 2 lines.

## Context pack
- Docs: ADR-0039 (all), ADR-0009 §Session; `SECURITY.md` §Authentication L6-35.
- Exemplars: `Api/Auth/SessionValidator.cs:ValidateAsync` L50-92; `Application/Auth/GetSessionState/*` (internal
  pre-auth request pattern); `Application/Auth/CompleteLogin/` handler (where `RecordLogin` is called).
- Touch points: `IHostGroupDirectory`/`HostGroupListing.GroupsOf` (T-0254); `User.ReplaceGroups` (T-0250);
  `Application/Auth/AuthErrors.cs`; `Infrastructure/Persistence/ConsoleDbContext.cs` + `IReadModel` implementation.
- Tests: `tests/FleetConsole.Api.Tests/Integration/SessionRevalidationTests.cs` (interval 0 → checks every request);
  `DevGroupMembership.SetGroups` via `TestOAuthServer.Services` (T-0254); `OpenShiftHostStub` Unreachable flag.

## Acceptance criteria
- [x] PREC-1 (membership half; 403/cluster-list half deferred to T-0253, see Work log): user in `sre-emea` (only grant path) proxies OK; `SetGroups(user, [])`; next request after the interval → 403 `Proxy.NotAvailable`, and `GET /api/clusters` no longer lists the cluster.
- [x] Membership change writes `User.Groups` once and one `user.groups_changed` audit entry; unchanged membership writes no user row (assert `version` unchanged) but updates `user_group_checks`.
- [x] Host unreachable: user whose recorded groups carry a grant → session rejected (401 next request); user with only direct grants → session kept.
- [x] Read-only user's revalidation syncs (not blocked by ReadOnlyGuardBehavior); login records the check time.
- [x] `scripts/check-be.sh` green.

## Work log
- 2026-11-24 backend-engineer: started; group grants are not yet effective in proxy/cluster list (T-0253, parallel).
- 2026-11-24 backend-engineer: done. PREC-1 HTTP test asserts the groups sync + audit only; proxy 403/cluster list need T-0253. Deviations: AuthErrors is in `Abstractions/`;
  minimal edits outside paths: Infrastructure `DependencyInjection.cs`, test `ServiceProviderBuilder.cs`, 2 fake read models (new `IReadModel.UserGroupChecks`); `SessionValidatorTests` stubs the sync (+ reject/retry tests).
  SessionValidator dispatches the sync in a fresh scope + 1 retry on concurrency conflict (parallel requests revalidating). Recorder upserts via SQL, staged insert for a user added in the same UoW (FK).

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. Build -warnaserror green; filtered tests (SyncUserGroups,
  SessionRevalidation, SessionValidator, CompleteLogin, Migration/Persistence) 132/132 green. Checked: retry is bounded
  (2 attempts, only on `Persistence.ConcurrencyConflict`; upsert is idempotent; a second conflict rejects = fail closed);
  own DI scope keeps the request `DbContext` clean; `user.groups_changed` actor = `AuditActor.Revalidation`; migration +
  snapshot match the contract (PK, FK RESTRICT); fail-closed EXISTS on group grants matches ADR-0039 §3; no group names
  logged (asserted). `AuthErrors` in `Abstractions/` is correct — that is where the type already lives (contract path was wrong).
  Architect fix applied: reflowed the SECURITY.md revalidation bullet to ≤120 cols.
  Deferred (not blocking): PREC-1 proxy 403 + `GET /api/clusters` assertions land with T-0253 (Handover note).
  Optional: tests/FleetConsole.Application.Tests/Audit/ListAuditEntries/ListAuditEntriesTests.cs:1 — new `using` sorted
  before `System.*`; double blank lines before `UserGroupChecks` there, in AuthFakes.cs:477 and
  AuthorizeProxyRequestHandlerTests.cs:290; SessionValidatorTests.cs:5 using order.

## Handover notes
- `SyncUserGroupsCommand` (Application/Auth/SyncUserGroups) runs on every revalidation from `SessionValidator`, not over HTTP;
  it isn't mutating, so read-only users sync too. Ok listing → `User.ReplaceGroups` (raises `UserGroupsChanged` only on a diff,
  so unchanged membership doesn't touch `users.xmin`) + upserts `user_group_checks` (migration `UserGroupChecks`).
- Forbidden/Unavailable → `Auth.GroupsUnavailable` (session rejected, 401) only if a recorded group carries a group grant;
  otherwise kept. Logs carry user id + status only, never group names.
- `CompleteLoginHandler` records the check time at login (new ctor param `IUserGroupCheckRecorder`).
- T-0253 follow-up: add the proxy 403 + `GET /api/clusters` assertions to
  `SessionRevalidationTests.RemovedFromHostGroup_…` once group grants authorize. Its orchestrator note on
  `UserConfiguration`'s "never queried by element" comment: T-0255 didn't touch that file, so T-0253 should fix it.
- Tests force group re-reads with a `ManualClock` variant advanced past `MaxSnapshotAge` (`Refresh`).
