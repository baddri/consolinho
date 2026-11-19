---
id: T-0051
title: User detail page — match cluster detail error/gone handling; small T-0035 label nits
status: todo
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
- [ ] User detail: non-404 refetch error keeps loaded data; 404 after load → exactly one toast + navigate to list.
- [ ] Tests for both paths (pattern: `clusters/ClusterDetailPage.test.tsx`, `clusters/useClusterGone.ts`).
- [ ] Label/TLS nits fixed.
- [ ] `scripts/check-fe.sh` green.

## Work log

## Handover notes
