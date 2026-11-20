---
id: T-0052
title: Connection test — show disabled-cluster note when opened from the credentials tab
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0038]
paths: [web/src/features/admin/credentials/, web/src/features/admin/connection-test/]
review_rounds: 1
---

## Goal
From T-0038 review: the "cluster is disabled" note in the connection-test dialog only appears when the test is opened from
the cluster actions; `CredentialCluster` (credentials tab / `CredentialModalFrame`) lacks `isEnabled`. Pass it through so
the note shows from every entry point.

## Acceptance criteria
- [x] `CredentialCluster` carries `isEnabled`; the test dialog shows the disabled note when opened from the credentials tab.
- [x] Test for that path.
- [x] `scripts/check-fe.sh` green.

## Work log
- 2026-11-20 frontend-engineer: `CredentialCluster` now picks `isEnabled`; `TestConnectionCluster` aliases it (required,
  no longer optional) so every entry point must supply it. Credentials-tab test asserts the note on dev-2. Gate green.

## Handover notes
- At runtime the note already showed from the credentials tab (ClusterDetailPage passes the full `ClusterDetail`); the
  gap was type-level only. Now `isEnabled` is required on `CredentialCluster`/`TestConnectionCluster`, so a future caller
  passing `{ name, environment }` fails typecheck instead of silently hiding the note.
- Modal check changed `cluster.isEnabled === false` -> `!cluster.isEnabled` (lint: no-unnecessary-boolean-literal-compare).
- Test: `connection-test/TestConnection.test.tsx` "TEST-1/5: disabled dev-2 — credential kebab ..." asserts the note.
- `scripts/check-fe.sh <path>` takes paths relative to `web/` (e.g. `src/features/...`).

## Review
- 2026-11-20 round 1 (orchestrator, trivial type-only change): APPROVE — `CredentialCluster` requires `isEnabled`; test asserts the note from the credential row; check-fe green (46/504).
