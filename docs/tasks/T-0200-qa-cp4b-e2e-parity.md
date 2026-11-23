---
id: T-0200
title: CP4b QA — QGB e2e, carried CP4a e2e, parity rows
status: todo
owner: qa-engineer
checkpoint: 4b
depends_on: [T-0189, T-0190, T-0191, T-0192, T-0193, T-0194, T-0195, T-0196, T-0197, T-0198, T-0199]
paths: [web/e2e/workloads.e2e.ts, web/e2e/search.e2e.ts, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
QGB-1/2 plus the e2e carried from §4a.9, run against the mock dev stack, and a parity row for every new page.

## Contract / design notes
- e2e (QGB-1): CronJob `nightly-report` → Start Job → lands on the new Job's details; Search with Deployment + Pod +
  Service and label `app=web` shows three sections; Secret `db-credentials` values masked by default, Reveal/Hide works.
- Carried CP4a e2e (§4a.9): Edit update strategy (Deployment `web`), pod status popover, LOG-6 auto-reconnect.
- Api side of QGB-1 (Job create RW/RO) is already covered by `ProxyMutationVerbTests` (`POST …/jobs` row); cite it.
- Parity rows in `ocp-parity.md` for: StatefulSets, DaemonSets, ReplicaSets (standalone), ReplicationControllers,
  DeploymentConfigs (+ RC tab), Jobs, CronJobs (+ Jobs tab), HPAs, ConfigMaps, Secrets, Search, label → Search link.
  Each row names the OCP file, our file and `match`/deviation; accepted deviations from §4b.7 are recorded as such.

## Context pack
- Exemplars: `web/e2e/workloads.e2e.ts` (CP4a flows), T-0186 (QA task format and parity rows).
- Tool: `scripts/ui-probe.mjs` for style checks instead of screenshots.

## Acceptance criteria
- [ ] QGB-1: the three new e2e flows and the three carried ones pass; no `fixme`.
- [ ] QGB-2: parity rows for every CP4b page, all `match` or recorded deviation.
- [ ] Gates green (`scripts/check-fe.sh`, `scripts/check-be.sh`).

## Work log

## Review

## Handover notes
