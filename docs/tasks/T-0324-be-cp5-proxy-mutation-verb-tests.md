---
id: T-0324
title: CP5 proxy safety — mutation-verb rows for PVC expand, node (un)schedulable and Create Project (SAFE5-2/3, QG5B-1)
status: todo
owner: backend-engineer
checkpoint: 5a
depends_on: []
paths: [tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyMutationVerbTests.cs]
review_rounds: 0
---

## Goal
CP5a/CP5b add no endpoints (contract §1): their mutations go through the proxy. Prove the existing read-only guards and
audit cover the three new mutation shapes, so SAFE5-2/3 and QG5B-1 are backed by Api tests.

## Scope
- In: new rows in `ProxyMutationVerbTests.Rows()`; nothing in `src/` (if a row fails, stop and report — it is a bug,
  file it, don't patch the proxy here).
- Out: FE audit labels (SAFE5-5, frontend task).

## Contract / design notes
Rows (each for RO-grant principal → 403 `Proxy.ReadOnlyGrant`, read-only user → 403 `Proxy.UserReadOnly`, RW → forwarded
+ one audit entry), following the existing row shape:
- `PATCH /api/v1/namespaces/{ns}/persistentvolumeclaims/{name}` with `application/merge-patch+json`
  (`{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}`) — PVC expand.
- `PATCH /api/v1/nodes/{name}` with `application/strategic-merge-patch+json` (`{"spec":{"unschedulable":true}}`) — cordon.
- `POST /apis/project.openshift.io/v1/projectrequests` with `application/json` body — Create Project.

## Context pack
- `tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyMutationVerbTests.cs:Rows` (L50-77, row tuple shape) and the
  theory (L79+) — add rows only.

## Acceptance criteria
- [ ] Three new resource shapes × existing principals pass; audit row asserted for RW like existing rows.
- [ ] `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
