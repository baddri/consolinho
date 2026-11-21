---
id: T-0108
title: RUNBOOK day-2 gaps — OAuth secret rotation, running version, undecryptable credentials, restore drill
status: todo
owner: backend-engineer
checkpoint: 6
depends_on: []
paths: [docs/ops/RUNBOOK.md]
review_rounds: 0
---

## Goal
The CP3 runbook meets OPS-1..3. Reviewing it from a day-2 view (CP3 PO acceptance) found four gaps that an on-call admin
would hit with nothing to follow.

## Scope
- In:
  1. §4.6 or new §: **rotate the OAuth client secret**. Order: new value in the OAuthClient and the Secret
     `consolinho-oauth`, then `oc rollout restart`. Say how long logins fail in between.
  2. §4.7/§6: **which version is running**: image digest + `app.kubernetes.io/version` label in one `oc get` command.
  3. §9 row: **credential Test fails / proxy says it can't decrypt the token** after a restore, teardown or a lost
     Secret. Cause: DP certificate and `data_protection_keys` don't match. Fix: restore the matching pair (§7) or
     re-enter the credentials. Use the server log line operators will actually see.
  4. §7: **verify after restore**: pods Ready, then **Test** an existing credential. Recommend a periodic restore
     drill on a dev cluster.
- Out: tooling, scripts or app changes.

## Acceptance criteria
- [ ] All four items are in the runbook. Commands are runnable and use placeholders only.
- [ ] Human check on a dev deploy: the dev `pg_dump`/`pg_restore` commands in §7 work as written against the
      rhel9/postgresql-16 pod (local-socket auth). If not, fix the commands.

## Work log

## Review

## Handover notes
