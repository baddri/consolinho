---
id: T-0339
title: CP5b QA — Playwright for nodes/overview/operators, fake apiserver additions, AC verification
status: done
owner: qa-engineer
checkpoint: 5b
depends_on: [T-0330, T-0331, T-0332, T-0333, T-0334, T-0335, T-0336, T-0337, T-0338, T-0341]
paths: [web/e2e/, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
QG5B-1/2 verification: run the gates, write the Playwright flows against the fake apiserver, tick the §5b ACs.

## Scope
- In: e2e for NODE-5 (RW marks unschedulable — modal names the cluster — and schedulable again; RO sees disabled
  actions), Overview four cards and the `prod-k8s-1`-style Kubernetes degradation, Installed Operators list +
  Subscription tab; extend the fake apiserver (new file next to T-0341's `fakeClusterHealth.ts`, e.g.
  `fakeComputeApi.ts`: node PATCH, pods by `spec.nodeName`, CSVs/Subscriptions, Infrastructure, events) — keep
  `fakeKubeApi.ts` edits to hook lines.
- Out: Api tests for NODE-5 (done in T-0324).

## Context pack
- Docs: spec §5b.6; T-0311 (CP5a QA shape).
- Touch points: `web/e2e/support/fakeKubeApi.ts`, `fakeWorkloadsApi.ts`, `fakeClusterHealth.ts` (T-0341).

## Acceptance criteria
- [x] QG5B-1: `scripts/check-fe.sh` and `scripts/check-be.sh` green; FE unit tests listed in QG5B-1 exist (node status, shared health table, OLM-1 selector).
- [x] QG5B-2: Playwright flows above green and stable (3 consecutive runs).
- [x] Every §5b AC ticked or a bug task filed; parity rows from T-0338 cross-checked.

## Work log
- 2026-11-25 qa-engineer: added `web/e2e/support/fakeComputeApi.ts` (a new stateful fake that applies field and label selectors server-side and handles node JSON Patch; `fakeKubeApi.ts` is unchanged) and `web/e2e/compute.e2e.ts` (10 tests).
- The spec passed 10/10 on 3 consecutive runs. Full e2e passed 60/60. check-fe passed 1571/1571 and check-be passed 431+882+1046, with no gates running concurrently. I filed no bugs.
- Parity rows 105 (Node details) and 110 (CSV details) now read match: the T-0369 and T-0368 gaps are done, with probe evidence in those tasks.

## Review

## Handover notes
Traceability, with evidence as e2e = `compute.e2e.ts` and unit = the feature tests:
- NODE-1 (Compute nav order, Kubernetes shows Nodes only): e2e.
- NODE-2 (status line, "Scheduling disabled", filters): unit `nodes.test.tsx`.
- NODE-3 (details, Images section): e2e and unit.
- NODE-4 (fieldSelector, count line, Exclude DaemonSet filter, bare-pod popover): e2e and unit.
- NODE-5: e2e for RW cordon in a modal naming the cluster, then uncordon with a toast and no modal; JSON Patch with the grant token; the RO item is disabled with its reason and writes nothing. Api coverage is `ProxyMutationVerbTests`.
- NODE-6: by absence.
- MS-1..4: unit (machines and machineSets tests), plus e2e for the nav.
- CS-1..3: unit `clusterSettings.test.tsx`. Default sort is Name, so parity won over the spec's fleet option.
- OVW-1..5: e2e covers the four cards, the update alert, and `limit=500` with no continue. OVW-2 on Kubernetes shows the Kubernetes version, hides Cluster ID and channel, has no Operators item, and makes no config.openshift.io reads.
- OVW-6: unit `overview.test.tsx`.
- OLM-1: e2e confirms `!olm.copiedFrom` and each operator listed once.
- OLM-2/3/5: e2e confirms markdown is sanitised, there is no remote `img`, and there is no Edit/Delete. Unit covers the `csvIconSrc` data-URI check and the read-only YAML tab.
- OLM-4: e2e and unit.
- QG5B-1 unit tests: node status (`nodes.test.tsx`), shared health rules (`shared/health/clusterHealth.test.ts`, `facts.test.ts`), OLM-1 selector (`installedOperators.test.tsx`, `kinds.test.tsx`).
- Copy that follows OCP instead of the spec, accepted by parity (no bug):
  - OLM-4 empty state reads "No Operator Subscription" (spec: "No Subscription found").
  - NODE-4 bare pod shows a "No owner" popover ("…Draining the node deletes it…") instead of the spec's tooltip copy.
  - OpenShift Status card has no Nodes item, as in OCP.
