---
id: T-0201
title: CP4b proxy coverage — DeploymentConfig/Secret mutation verbs, Secret values never logged
status: todo
owner: backend-engineer
checkpoint: 4b
depends_on: []
paths: [tests/FleetConsole.Api.Tests/Integration/Proxy, tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs, tests/FleetConsole.Api.Tests/Integration/TokenLeakScanner.cs]
review_rounds: 0
---

## Goal
Prove the proxy's mutation guard and audit cover the new CP4b write paths, and that Secret data never leaks into
audit entries or logs (spec CP4b §4b.7 backend asks, CFG-4, QGB). Test-only unless a test exposes a defect (then file a bug task).

## Scope
- In: `ProxyMutationVerbTests` rows for POST `apis/apps.openshift.io/v1/namespaces/<ns>/deploymentconfigs/<n>/instantiate`,
  POST `…/deploymentconfigs/<n>/rollback`, PUT `…/deploymentconfigs/<n>`, PATCH `api/v1/namespaces/<ns>/secrets/<n>`:
  read-only grant → denied (ProblemDetails, no upstream call); read-write → forwarded with the grant's token and audited.
- In: extend `ProxyTokenLeakSweepTests` (or a sibling) so a Secret GET/PATCH with recognizable fake `data` values never
  shows those values (raw or base64) in audit rows or captured logs.
- Out: product code changes; Job create (already covered per QGB-1).

## Context pack
- Exemplars: existing rows in `ProxyMutationVerbTests`; `ProxyTokenLeakSweepTests` + `TokenLeakScanner` (T-0157).
- Docs: `docs/architecture/SECURITY.md` (grep the proxy mutation guard / audit sections).

## Acceptance criteria
- [ ] The four verb/path rows pass for read-only (denied, nothing forwarded) and read-write (forwarded, audited).
- [ ] CFG-4: Secret values (plain and base64) are absent from audit entries and logs for GET and PATCH.
- [ ] Build and tests green (CLAUDE.md rule 4: `scripts/check-be.sh`)

## Work log

## Review

## Handover notes
