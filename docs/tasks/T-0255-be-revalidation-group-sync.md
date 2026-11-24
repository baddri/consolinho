---
id: T-0255
title: Session revalidation re-reads group membership from the host; fails closed (PREC-1, ADR-0039)
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0250, T-0254]   # wave 2
paths: [src/FleetConsole.Application/Auth, src/FleetConsole.Application/Abstractions/Persistence, src/FleetConsole.Application/Abstractions/IReadModel.cs, src/FleetConsole.Api/Auth, src/FleetConsole.Infrastructure/Persistence, tests/FleetConsole.Application.Tests/Auth, tests/FleetConsole.Api.Tests/Integration/SessionRevalidationTests.cs]
review_rounds: 0
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
- [ ] PREC-1: user in `sre-emea` (only grant path) proxies OK; `SetGroups(user, [])`; next request after the interval → 403 `Proxy.NotAvailable`, and `GET /api/clusters` no longer lists the cluster.
- [ ] Membership change writes `User.Groups` once and one `user.groups_changed` audit entry; unchanged membership writes no user row (assert `version` unchanged) but updates `user_group_checks`.
- [ ] Host unreachable: user whose recorded groups carry a grant → session rejected (401 next request); user with only direct grants → session kept.
- [ ] Read-only user's revalidation syncs (not blocked by ReadOnlyGuardBehavior); login records the check time.
- [ ] `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
