---
id: T-0257
title: Effective access admin query — winning grant and why, per cluster (EFF-1..5)
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0253, T-0255]   # wave 3, parallel with T-0256
paths: [src/FleetConsole.Application/Users/GetEffectiveAccess, src/FleetConsole.Application/Access, src/FleetConsole.Api/Endpoints/Admin/UsersAdminEndpoints.cs, tests/FleetConsole.Application.Tests/Users, tests/FleetConsole.Api.Tests/Integration/Admin]
review_rounds: 0
---

## Goal
Answer Anna's "why does Sam have (or not have) write access on prod-eu-1?" from the **same** resolver and loader the
proxy and switcher use (PREC-8, ADR-0034 §6) — no second implementation.

## Scope
- In: `GetEffectiveAccessQuery` + handler + endpoint; `ClusterAccessReader` gains what the view needs (all
  verdicts' credential names) without changing proxy behaviour.
- Out: UI (FE T-026x).

## Contract / design notes
- `GET /api/admin/users/{username}/effective-access` (name `GetEffectiveAccess`, tag `Users`) →
  `EffectiveAccessDto`; shapes, ordering and outcome enum: **`docs/specs/CP4.5-api-contract.md` §5**.
- `GetEffectiveAccessQuery(string Username) : IQuery<EffectiveAccessDto>, IAdminRequest`; 404 `Users.NotFound`.
- Handler: one query for the user (+ left join `user_group_checks` for `groupsAsOf`, fallback `LastLoginAt`), then
  `ClusterAccessReader.LoadAsync(user.Id, null, sessionIsReadOnly: false)` — the **stored** flag only (admin view;
  the switcher additionally ORs the session flag, which equals the stored one after revalidation). Deactivated user →
  `clusters: []` (the reader's active-user join already yields none). Map `AccessResolution.Verdicts` →
  `candidates` (winner first), `CandidateOutcome` → contract enum, `NarrowedByReadOnlyFlag`.
- Candidate credential names: extend the reader's per-candidate projection with the credential name (still one
  statement); the token stays encrypted and is not part of this DTO (CRED-2).
- Note on PREC-7: disabled clusters don't appear (switcher parity, EFF-3).

## Context pack
- Docs: spec §4.5 EFF (grep `EFF-`); ADR-0034 §6.
- Exemplars: `Application/Users/GetUser/{GetUserHandler,UserDetailDto}.cs` (user lookup by username + DTO docs).
- Touch points: `Application/Access/ClusterAccessReader.cs` (T-0253), `Domain/Access/Resolution/*` (T-0251),
  `IReadModel.UserGroupChecks` (T-0255), `Api/Endpoints/Admin/UsersAdminEndpoints.cs` L37-43.

## Acceptance criteria
- [ ] EFF-1/2: fixture with direct RO + group RW (prio 50) + group RO (prio 10) on C1, two groups tied at top on C2 (inserted bypassing the unique index is not possible → unit-test the tie mapping on the handler with a fake reader result), user RO flag on C3 → expected source, outcomes, `beatenBy`, `narrowedByReadOnlyFlag`.
- [ ] EFF-3: for one fixture, the cluster set and modes equal `GET /api/clusters` as that user (integration test logs in as the user).
- [ ] EFF-4: `groupsAsOf` = last check time after revalidation; = last login before any revalidation; null if never logged in.
- [ ] EFF-5: no access → `clusters: []`; unknown user → 404; non-admin → 403; OpenAPI updated; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
