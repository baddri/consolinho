---
id: T-0201
title: CP4b proxy coverage — DeploymentConfig/Secret mutation verbs, Secret values never logged
status: done
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
- [x] The four verb/path rows pass for read-only (denied, nothing forwarded) and read-write (forwarded, audited).
- [x] CFG-4: Secret values (plain and base64) are absent from audit entries and logs for GET and PATCH.
- [x] Build and tests green (CLAUDE.md rule 4: `scripts/check-be.sh`)

## Work log
- 2026-11-23 backend-engineer: ff-merged cp/4-workloads. Added 4 CP4b rows to `ProxyMutationVerbTests` (×3 principals = 12
  cases; DC instantiate/rollback audit as `proxy.create` + subresource, PUT as `proxy.update`). Added
  `NoSecretValue_InAuditEntry_DatabaseRow_OrLogLine_ForSecretGetAndPatch` to `ProxyTokenLeakSweepTests`. No defects found;
  no product code, fake-server or scanner changes needed. `scripts/check-be.sh` green (849 Api tests, Testcontainers ok).

## Review
- 2026-11-23 backend-architect, round 1: **APPROVE**. 4 rows × 3 principals reuse the T-0157 theory, which asserts
  upstream `ShouldHaveSingleItem` (token, no cookie, byte-for-byte target) / `ShouldBeEmpty` on refusal + one audit row.
  CFG-4 sweep proves travel (PATCH body seen upstream, GET body passed through), scans audit/DB/Debug-level logs in 3 forms.
  `dotnet test --filter Proxy`: 140/140 green.
  - Optional: `ProxyTokenLeakSweepTests.cs:~186` — also assert `factory.Logs.Entries` holds a line for this request
    (e.g. the Secret path/cluster), so the log haystack is shown to cover the un-audited GET; same gap as the exemplar.

## Handover notes
- Rows reuse the existing theory, so read-only grant, globally read-only user and read-write are all covered per verb.
- CFG-4 sweep scans audit summary/details, a full DB dump and all captured logs for three values (stored, patched via
  `data` base64, patched via `stringData` plain) in plain/base64/base64url. Response bodies are intentionally not scanned
  (Secret values are passed through to the browser by design). Proof of travel: the fake saw the exact PATCH body.
