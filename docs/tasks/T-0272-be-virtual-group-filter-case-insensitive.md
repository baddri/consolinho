---
id: T-0272
title: Make the system: virtual-group filter case-insensitive
status: todo
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
- [ ] Given host groups `[System:Ops, SYSTEM:authenticated, sre]`, When the user logs in or is revalidated, Then `User.Groups` = `[sre]`.
- [ ] Unit test in Application.Tests (OpenShiftGroups / SyncUserGroupsHandler) covers mixed case.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
