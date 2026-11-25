---
id: T-0324
title: CP5 proxy safety — mutation-verb rows for PVC expand, node (un)schedulable and Create Project (SAFE5-2/3, QG5B-1)
status: done
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
- [x] Three new resource shapes × existing principals pass; audit row asserted for RW like existing rows.
- [x] `scripts/check-be.sh` green.

## Work log
- 2026-11-25 backend-engineer: added PVC expand (merge-patch), node cordon (strategic-merge-patch, cluster-scoped) and
  projectrequests POST rows + class doc; 42/42 ProxyMutationVerbTests, `check-be.sh` green (431/840/1001). No src change.

## Review
- 2026-11-25 backend-architect, round 1: **APPROVE**. Three rows match the contract (paths, verbs, patch content
  types, audit `proxy.patch`/`proxy.create`, no subresource) × 3 principals via the unchanged theory. Shared `{}` body
  accepted: read-only guards and audit key on method/path only, and the theory already asserts byte-for-byte forwarding.
  Filtered re-run blocked by a concurrent agent's build error in `Application/Abstractions/Kubernetes/IClusterHealthReader.cs`
  (CS1734, not this task); relying on the engineer's 42/42 + green `check-be.sh`.

## Handover notes
- Rows only; theory unchanged, so the request body is still the shared `{}` (guards and audit never inspect bodies —
  the contract's sample bodies would add nothing to SAFE5-2/3, QG5B-1). All three shapes: RO grant → 403
  `Proxy.ReadOnlyGrant`, RO user → 403 `Proxy.UserReadOnly`, RW → forwarded byte-for-byte with grant token, one audit row
  (`proxy.patch`/`proxy.create`, no subresource). No proxy bug found.
