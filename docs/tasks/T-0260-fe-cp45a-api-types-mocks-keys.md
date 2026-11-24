---
id: T-0260
title: CP4.5a FE foundation — contract types, mock backend (groups, group grants, effective access), query keys
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: []          # lane root; runs before the BE lands (contract = docs/specs/CP4.5-api-contract.md)
paths: [web/src/shared/api/, web/src/mocks/, web/src/features/admin/queryKeys.ts, web/src/features/admin/AdminResourceLink.tsx, web/src/features/admin/grants/, web/src/features/admin/groups/api.ts, web/src/features/admin/groups/groupPaths.ts, web/src/features/admin/grants/SubjectKindLabel.tsx, web/src/features/admin/effective-access/api.ts, web/src/features/cluster-context/]
review_rounds: 1
---

## Goal
Give every CP4.5a FE task a typed, stateful mock of the new admin API so the UI lanes (T-0261…T-0265) run in parallel
with the backend (T-0252/T-0256/T-0257). The Api isn't serving the shapes yet, so the types are added to
`schema.gen.ts` **by hand, exactly as the generator would emit them** from the contract; T-0241 later replaces them by
a real `npm run gen:api` (EFF-6).

## Scope
- In:
  - `schema.gen.ts`: contract §1–§5 shapes and paths (Grant fields, `UpdateGrantRequest.priority`, group grant routes,
    `/groups`, `/groups/{groupName}`, `/users/{username}/effective-access`). Add one marker comment
    `// HAND-EDITED CP4.5a (T-0260) — replaced by gen:api in T-0241` at the top of the file.
  - `shared/api/types.ts` named aliases: `GrantSubjectKind`, `HostGroupsStatus`, `CreateGroupGrantRequest`,
    `BulkGroupGrantRequest`, `GroupList`, `GroupRow`, `GroupDetail`, `GroupMember`, `EffectiveAccess`,
    `EffectiveClusterAccess`, `AccessSource`, `AccessCandidate`, `AccessCandidateOutcome`.
  - Mocks (ADR-0016, stateful, reset per test): see design notes.
  - `adminKeys`: `groups()`, `group(name)`, `groupGrants(name)`, `userEffectiveAccess(username)`.
  - `AdminKind` gains `'Group'` (abbr `G`, OCP's Group abbr).
  - Shared bits every lane links to: `groups/groupPaths.ts:groupDetailPath(name)` =
    `fleetAdminPath(`groups/${encodeURIComponent(name)}`)` and `grants/SubjectKindLabel.tsx` (PF `Label isCompact`
    "User" / "Group", spec §5).
  - **Read hooks** (so lanes B and C don't wait on each other): `groups/api.ts` → `useGroups()` (`GET /groups`,
    `adminKeys.groups()`), `useGroup(name)` (`adminKeys.group(name)`, 404 → `ApiError` code `Groups.NotFound`);
    `grants/api.ts` → `useGroupGrants(name)` (`adminKeys.groupGrants(name)`); `effective-access/api.ts` →
    `useEffectiveAccess(username)` (`adminKeys.userEffectiveAccess(username)`). All via `unwrap` (ADR-0015).
  - **Compile fallout only** of `Grant.username` becoming nullable (grants UI, switcher mock): keep today's behaviour
    for user grants with `grant.subjectName`; no new UI (that is T-0261/T-0262).
- Out: any visible UI change; real regeneration (T-0241).

## Contract / design notes
- Mock db: `MockGrant` gets `subjectKind: 'user' | 'group'`, `subjectName`, `priority: number | null` (keep
  `username` only as derived output in `toGrant`; filter user grants by `subjectKind === 'user'`). New
  `MockHostGroups { status: HostGroupsStatus; readAt: string; groups: { name: string; users: string[] }[] }` in the db,
  test helper `setMockHostGroups(status | groups)` exported from `mocks/index.ts`.
- Fixtures (fake names): host groups `sre` (alice, bob, not-registered `zoe`), `platform`, `auditors`,
  `system:authenticated` (must be filtered out); group grants: `sre` → dev cluster readOnly priority 100, `platform` →
  staging readWrite priority 200, and a grant-only group `ghost-team` (not on host) → dev priority 50. Keep every
  existing user-grant fixture unchanged so existing tests pass.
- Handlers (contract wording and error copy verbatim, codes `Grants.PriorityTaken`, `Grants.AlreadyExists`,
  `Groups.NotFound`): `GET /clusters/{name}/grants` both kinds in contract order; `GET/POST /groups/{groupName}/grants`;
  `POST /groups/{groupName}/grants/bulk` (all-or-nothing, per-item `items[i].clusterName` errors for priority taken /
  already granted); `PUT /grants/{id}` priority rules; `GET /groups` (host ∪ grants, `system:*` excluded,
  `foundOnHost`/`memberCount` null when status ≠ ok); `GET /groups/{groupName}` (404 rule §4); `GET
  /users/{username}/effective-access`.
- **One mock resolver** `mocks/handlers/access.ts:resolveAccess(user, clusterName)` implementing PREC-3..6 (direct beats
  group, priority desc, tie → readOnly, then lower id; user RO flag narrows; disabled user/cluster → none; `system:*`
  ignored), used by effective-access **and** `GET /api/clusters` (switcher) — the FE mirror of PREC-8. Table-driven
  unit test `mocks/access.test.ts` (extend the existing file).
- `groupsAsOf` = the mock user's `lastLoginAt`.

## Context pack
- Docs: `FRONTEND.md` § Data fetching rules (keys table), § Testing; ADR-0016; contract `docs/specs/CP4.5-api-contract.md` (whole, 147 lines — it is your spec).
- Exemplars: `features/admin/grants/api.ts:useUserGrants` (read hook), `web/src/mocks/handlers/grants.ts:bindBulkItems` (per-item errors), `mocks/handlers/grants.ts` L118-210 (command handlers), `mocks/handlers/representations.ts:toGrant`, `mocks/handlers/clusters.ts` L10-20 (switcher list — move onto `resolveAccess`).
- Touch points: `mocks/fixtures/types.ts:MockGrant`, `mocks/fixtures/grants.ts`, `mocks/db.ts:MockDb/seed/resetMockDb`, `mocks/handlers/users.ts` L229 (user grants: direct only), `mocks/handlers/adminClusters.ts` L246, `features/admin/queryKeys.ts:adminKeys`, `features/admin/AdminResourceLink.tsx:AdminKind/ADMIN_KIND_ABBR`, `shared/api/types.ts`.
- Fallout to check with `npm run typecheck`: `grants/GrantRow.tsx:UserCell`, `grants/GrantFormModal.tsx:titleOf` + `granted` set (L122), `grants/RevokeGrantModal.tsx`, `grants/grantText.ts`.

## Acceptance criteria
- [x] Generated-shape types for contract §1–§5 exist with the marker comment; aliases exported from `shared/api`.
- [x] Every new route is mocked with contract status codes and copy; mock tests cover: `system:*` refused (GRP-3), invalid name (GRP-6), priority missing/out of range (GRP-2), priority taken names the other group (GRP-4), duplicate (GRP-5), bulk all-or-nothing with per-item errors (GPG-3), `/groups` hostStatus `forbidden` keeps grant-only groups.
- [x] `resolveAccess` table test: direct vs group, priority, tie RO wins, RO flag narrows, `system:*` ignored, no match; switcher mock and effective-access mock use it.
- [x] `adminKeys` has the four new factories; `AdminKind` has `Group`; the four read hooks exist with a hook test each (MSW).
- [x] No visible UI change; all existing tests pass unchanged; `scripts/check-fe.sh` green.

## Work log
- 2026-11-24 frontend-engineer: started; contract types, mocks, resolver, keys, read hooks.
- 2026-11-24 frontend-engineer: done. Group grant fixtures placed so no existing test/switcher changes; check-fe green
  (1256 tests). No UI probe: no screen changed by design.

## Review
**Round 1 — frontend-architect, 2026-11-24: APPROVE.** `scripts/check-fe.sh` green (118 files, 1256 tests).
- ACs met: contract §1–§5 types (style matches the generator: `null | T`, `null | components[...]`), aliases, routes + copy/codes, keys, `Group` kind, 4 hooks with MSW tests.
- `resolveAccess` matches PREC-3..7: direct wins, priority desc, tie → readOnly then lower id, RO flag narrows (`narrowedByReadOnlyFlag`), `system:*` dropped, deactivated user/disabled cluster → none; switcher, Effective access and k8s proxy/exec share it (PREC-8).
- Deviation (a) accepted: the three tests only change the `MockGrant` literal shape (forced by this task's own design); assertions untouched.
- Deviation (b) accepted: group rows render via `UserCell` on staging-eu-1 in the mock app only; T-0261 (not T-0262, as the handover note says) owns subject-kind rendering (UIG-4). Editing a group grant there gets 400 on `priority` until T-0262; mock-only.
- Optional: `mocks/fixtures/grants.ts:86` — no fixture user gets a cluster *via* a group (alice's direct grant beats `sre`), so the Effective access/e2e lanes have no group-sourced row to demo; T-0265 should add one (e.g. `platform` → a cluster for carol) and update the affected switcher assertions.
- Optional: `schema.gen.ts:1` — T-0241 must check the regenerated schema names (`GroupList`, `AccessCandidateOutcome`, …) against the `shared/api/types.ts` aliases; a rename surfaces only as typecheck errors there.
- 2026-11-24 ux-designer (light visual, mock UI @1280, Playwright text dump; no page errors/console errors): **APPROVE**
  - staging-eu-1 Access tab — `ghost-team`/`sre` render as `U` User rows linking to `/admin/users/<group>` (404 user), no Display name/status line, kebab present — interim OK, no empty cells or broken layout; T-0261/T-0262 must land before CP4.5a closes.
  - Switcher (alice 4 clusters, staging Read write; admin 3), users list Cluster grants counts, alice/bob Access tabs — unchanged.
  - Follow-up (T-0261) — cluster details "Users with access" for staging-eu-1 went 1 → 3 because `grantCount` now counts group grants; label is false for groups. OCP has no counterpart; fix: count users only, or relabel "Grants" / "1 user, 2 groups". Credential "Grants" column 1 → 3 is correct as is.

## Handover notes
- `schema.gen.ts` hand-edited (marker line 1); T-0241's `gen:api` must reproduce it — diff then.
- `Grant.username`/`userDisplayName`/`userStatus` are nullable now; UI uses `subjectName`. Compile fallout fixed in
  `grantText.ts`, `GrantRow`, `GrantsTable`, `RevokeGrantModal`, `GrantFormModal` (already-granted set = direct only)
  and, outside the task paths, the fixture-shape lines of `clusterContext.test.tsx`, `distributionDiscovery.test.tsx`,
  `useClusterNav.test.tsx` (`username` → `subjectName`; assertions unchanged).
- `mocks/handlers/access.ts` `resolveAccess` is the single resolver: switcher, Effective access **and the mock k8s
  proxy/exec** use it (PREC-8). Membership = the recorded `MockUser.groups`.
- Fixtures: `sre` (100) + `ghost-team` (50, not on host) on staging-eu-1; alice's direct grant wins there. `platform`
  and `auditors` are host groups without grants. Placed to keep credential/cluster counts and switchers unchanged.
- Known visible mock-only effect: staging-eu-1's cluster Grants tab lists the two group rows via `UserCell` (links
  to a user page) until T-0262 renders subject kinds.
- Group-grant mock routes live in `handlers/grants.ts`; group reads in `handlers/groups.ts`; `setMockHostGroups()`
  flips host status for tests. `..`/`.` names can't be tested through fetch (URL normalisation).
