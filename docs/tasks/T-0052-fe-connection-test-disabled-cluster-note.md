---
id: T-0052
title: Connection test — show disabled-cluster note when opened from the credentials tab
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0038]
paths: [web/src/features/admin/credentials/, web/src/features/admin/connection-test/]
review_rounds: 0
---

## Goal
From T-0038 review: the "cluster is disabled" note in the connection-test dialog only appears when the test is opened from
the cluster actions; `CredentialCluster` (credentials tab / `CredentialModalFrame`) lacks `isEnabled`. Pass it through so
the note shows from every entry point.

## Acceptance criteria
- [ ] `CredentialCluster` carries `isEnabled`; the test dialog shows the disabled note when opened from the credentials tab.
- [ ] Test for that path.
- [ ] `scripts/check-fe.sh` green.

## Work log

## Handover notes
