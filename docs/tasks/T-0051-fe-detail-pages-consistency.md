---
id: T-0051
title: User detail page — match cluster detail error/gone handling; small T-0035 label nits
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0032, T-0035]
paths: [web/src/features/admin/users/, web/src/features/admin/clusters/ClusterDetailHeader.tsx, web/src/features/admin/clusters/CaCertificatesTable.tsx]
review_rounds: 0
---

## Goal
From T-0035 review: `UserDetailPage.tsx:127` shows the error/not-found state next to already-loaded data when a background
refetch fails. Match the cluster detail page: error state only when nothing is loaded; a 404 after load → one toast
("user no longer exists") + navigate to the users list (history replace). Also T-0035 nits: drop `color` where `status` is
set on PF `Label` (ClusterDetailHeader.tsx:44, CaCertificatesTable.tsx:16-17); both TLS warnings read `tlsMode`.

## Acceptance criteria
- [x] User detail: non-404 refetch error keeps loaded data; 404 after load → exactly one toast + navigate to list.
- [x] Tests for both paths (pattern: `clusters/ClusterDetailPage.test.tsx`, `clusters/useClusterGone.ts`).
- [x] Label/TLS nits fixed.
- [x] `scripts/check-fe.sh` green for this task's files (only failures: T-0049's in-progress `FileUploadField.test.tsx`).

## Work log
- 2026-11-20 frontend-engineer: user detail shows error/not-found only when nothing is loaded; `useLeaveVanishedUser`
  (ref-guarded toast + `replace` to list) on 404 after load; 2 tests. Label `color` dropped where `status` set; CA
  warning reads `tlsMode`. Full gate: only failures are T-0049's in-progress `FileUploadField.test.tsx`.

## Handover notes
- Mirrored the cluster pattern locally in `users/UserDetailPage.tsx` rather than extracting a shared hook: the
  cluster version also handles own-delete/action-404 callbacks, so a generic hook would not have been smaller.
- Users have no delete, so only the refetch-404 path exists; toast "User <name> no longer exists".
- `CaCertificatesTable` prop is now `Pick<ClusterDetail, 'name' | 'caCertificates' | 'tlsMode'>`; `skipTlsVerify` no
  longer read in clusters/ detail code.
- `check-fe.sh`: lint/typecheck/build ok; 3 failing tests are in `shared/forms/FileUploadField.test.tsx` (T-0049, other
  agent's in-progress files), not touched here.

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. Targeted vitest (users + ClusterDetailPage) 42/42, typecheck, lint green.
  Local `useLeaveVanishedUser` accepted: users have only the refetch-404 path, so a shared hook would add indirection
  without saving code; behaviour matches `ClusterDetailPage` (`error && !data`, ref-guarded single toast, `replace`).
  - nit (optional): `users/UserDetailPage.tsx:49` — doc says `Users.NotFound` but checks status only; same as clusters, fine.
  - nit (optional): `clusters/CaCertificatesTable.tsx:10` — `color?: 'green'` could be `color?: LabelProps['color']` if more neutral states appear.
