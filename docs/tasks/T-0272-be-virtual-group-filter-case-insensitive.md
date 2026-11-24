---
id: T-0272
title: Make the system: virtual-group filter case-insensitive
status: done
owner: backend-engineer
checkpoint: 4.5b
depends_on: []
paths: [src/FleetConsole.Application/Auth, tests/FleetConsole.Application.Tests]
review_rounds: 0
---

## Goal
CP4.5a ACCEPT R2. `OpenShiftGroups.IsVirtual` matches `system:` ordinally, so a host group such as `System:Ops` is
recorded in `User.Groups` and shown in `/me` and in Effective access `groups`, although the resolver and `GroupName`
ignore it case-insensitively (GRP-3 "any case"). Admins see a group that never grants anything.

## Scope
- In: `src/FleetConsole.Application/Auth/OpenShiftGroups.cs` L25 → `StringComparison.OrdinalIgnoreCase`; update the XML doc.
- Out: changes to resolver/GroupName (already case-insensitive); migrating stored groups (they refresh at next login/revalidation).

## Acceptance criteria
- [x] Given host groups `[System:Ops, SYSTEM:authenticated, sre]`, When the user logs in or is revalidated, Then `User.Groups` = `[sre]`.
- [x] Unit test in Application.Tests (OpenShiftGroups / SyncUserGroupsHandler) covers mixed case.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 backend-engineer: started; IsVirtual → OrdinalIgnoreCase + XML doc. Tests: OpenShiftGroupsTests (new), SyncUserGroupsHandler mixed-case case; updated AdminConfigurationResolverTests that pinned `System:x` as kept.
- Outside paths (minimal): `Domain/Users/User.cs` ReplaceGroups guard → OrdinalIgnoreCase; its comment said "Ordinal, like IsVirtual" and would have gone stale.
- UserConfiguration.cs comment (T-0259) is about `= ANY(u.groups)` queries, not this filter → left as is per orchestrator. check-be.sh green (podman).

## Review
- 2026-11-24 backend-architect R1: **APPROVE**. Application 783 / Domain 431 green.
- Admin semantics checked: resolver (L33) unchanged in effect; the only change is `Auth:AdminGroups` startup validation (Infrastructure `DependencyInjection.cs:150`) now also refuses `System:*` entries. Intended: such a group is dropped at login, so the entry could never match; fail-fast beats a silently dead entry. No shipped config uses one (dev: `fleetconsole-admins`).
- `User.ReplaceGroups` out-of-paths edit accepted: guard and filter must agree.
- Reviewer fix: `AuthOptions.AdminGroups` XML doc now says "in any case".
- Optional: an options-validation test with a `System:Admins` entry (Api/Infrastructure tests); not blocking.

## Handover notes
- `OpenShiftGroups.IsVirtual` now ignores case, so login (CompleteLogin), revalidation (SyncUserGroups) and the host group directory all drop `System:*`/`SYSTEM:*`.
- `User.ReplaceGroups` guard matches case-insensitively too (filter and guard must agree; otherwise the guard would be looser than the filter).
- Stored `System:*` groups are not migrated; they disappear at next login/revalidation (scope Out).
- Still open: stale "never queried by element" comment in `Infrastructure/Persistence/Configurations/UserConfiguration.cs` L29 (T-0259 note) — unrelated to this filter, needs its own tiny task.
