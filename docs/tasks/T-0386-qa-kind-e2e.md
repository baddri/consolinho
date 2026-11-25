---
id: T-0386
title: Kind e2e (E2E_KIND=1) — sidebar, no OpenShift wording, namespace fallback, logs/exec on a kind pod (QG55B-3)
status: done
owner: qa-engineer
checkpoint: 5.5
depends_on: [T-0377, T-0379, T-0383, T-0384, T-0385]
paths: [web/e2e/kubernetes.e2e.ts, web/e2e/support/kind.ts]
review_rounds: 1
---

## Goal
Automate the CP5.5b behaviour against a real vanilla Kubernetes (kind) through FleetConsole, opt-in so normal runs
stay light (spec QG55B-3, DSC-1, DSC-5, NSF-1/3, CT-2).

## Scope
- In: one spec file + a small support module; skipped with a reason unless `E2E_KIND=1`.
- Out: changes to the fake-API smoke (stays unchanged), `global-setup.ts`, product code (failures → bug tasks).

## Contract / design notes
- `test.skip(process.env.E2E_KIND !== '1', 'Needs a kind cluster: scripts/kind-dev.sh up, then E2E_KIND=1')` at file top.
- Setup (`support/kind.ts`, `beforeAll`): read URL, CA PEM and the two tokens by running `scripts/kind-dev.sh tokens`
  (`child_process.execFileSync`, no secrets written to disk or logged); as `e2e-admin` register cluster `e2e-kind`
  (distribution `kubernetes`, CA bundle), credentials `fleet-viewer` and `team-a-editor` (inspect namespaces
  `team-a`), grant `team-a-editor` read-write to `e2e-member`; `afterAll` deletes the cluster (`deleteCluster`).
  Cluster name prefixed so `global-setup` cleans leftovers (check its `CLUSTER_PREFIX`).
- Cases:
  1. CT-2: connection test of `fleet-viewer` shows no "OpenShift version" row.
  2. DSC-1 (as admin with a `fleet-viewer` grant): sidebar sections/items exactly as spec DSC-1.
  3. NSF-1/3 (as `e2e-member`): `/c/e2e-kind` lands on `k8s/ns/team-a/pods`; selector lists `team-a` with the helper
     text and no "All namespaces".
  4. Pod logs of a `web` pod stream a line; exec terminal into it runs `echo ok`.
  5. DSC-5: on every page visited above, `page.locator('body')` text contains neither "OpenShift" nor "Project"
     (helper asserting after each navigation).

## Context pack
- Exemplars: `web/e2e/fleet.e2e.ts` `beforeAll` (L54-99: create cluster, credential, user, grant via admin API with
  `CSRF`), `web/e2e/support/session.ts:loginAs`, `ok`, `deleteCluster`, `RESERVED_USERS`; `web/e2e/global-setup.ts`
  (L13-47 prefix cleanup); `web/e2e/workloads.e2e.ts` (logs/exec assertions on the fake API).
- Inputs: `scripts/kind-dev.sh tokens` output format (T-0377), manual smoke results in T-0379's Work log.
- Run: `scripts/kind-dev.sh up`, `aspire start --launch-profile http && aspire wait web`, then
  `cd web && E2E_KIND=1 npx playwright test e2e/kubernetes.e2e.ts`; finish with `scripts/kind-dev.sh down` (RAM).

## Acceptance criteria
- [x] QG55B-3: without `E2E_KIND=1` the file is skipped with the reason; existing e2e unchanged.
- [x] With kind up: cases 1-5 pass; result recorded in the Work log.
- [x] Any product failure filed as a bug task, not patched here.
- [x] Lint/typecheck green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 qa-engineer: `web/e2e/kubernetes.e2e.ts` + `support/kind.ts`; cluster `e2e-smoke-kind-<ts>` (global-setup
  prefix), CA bundle, `fleet-viewer` → e2e-admin RO, `team-a-editor` (inspect `team-a`) → e2e-member RW; afterAll deletes.
- E2E_KIND=1 on kind v1.37: 4/4 pass (CT-2, DSC-1+5, NSF-1/3+5, logs+exec `echo ok`+5). DSC-5 checked on overview,
  namespaces, pods list (+selector open), pod logs, terminal. Default `npm run e2e`: kind spec skipped with reason.
- Token hygiene: Playwright traces request bodies of every request context, so credential POSTs go via Node `fetch`
  (cookies from storageState); verified with `--trace on`: no JWT in any trace. lint/typecheck green.
- Default `npm run e2e`: 57 passed, 4 skipped (kind spec), 3 failed (browse QG-4 x2, csp HOST-3): landing stuck +
  discovery refetch loop on the fake API's 404 `/api`, `/apis`; unrelated to this task's files → bug T-0389.

## Review
- 2026-11-26 frontend-architect, round 1: **APPROVE**. Token hygiene sound (tokens only in memory; credential POSTs
  via Node `fetch`, so traces skip them; on `execFileSync` failure only stderr is rethrown; errors give only the status). File-level
  `test.skip` skips the hooks as well. Teardown: `deleteCluster` ignores 404s, `finally` closes the context, and global-setup sweeps `e2e-smoke-*`. Suite runs
  serially (`workers: 1`), so the reserved-user grants don't collide. Selectors follow `fleet.e2e.ts`/`workloads.e2e.ts`.
  Optional nits:
  - web/e2e/kubernetes.e2e.ts:136 — `button[aria-expanded]` CSS plus a misleading trailing comment ("the cluster switcher's
    toggle" describes what is *excluded*) — reword the comment to say that.
  - web/e2e/kubernetes.e2e.ts:104-105 — the second `OpenShift version` assertion is redundant with the one before it.
  - web/e2e/kubernetes.e2e.ts:174 — `textContent() ?? ''` would build a bad path silently; `expect(pod).toMatch(/^web-/)`.
  - web/e2e/kubernetes.e2e.ts:48 — if login fails in `beforeAll`, `afterAll`'s `deleteCluster` may throw on the
    login redirect and mask the cause. Harmless because global-setup sweeps leftovers.

## Handover notes
Run: `scripts/kind-dev.sh up`, `aspire start --launch-profile http && aspire wait web`,
`cd web && E2E_KIND=1 npx playwright test e2e/kubernetes.e2e.ts` (~30 s), then `scripts/kind-dev.sh down`.
Gotchas: credentials table is role `grid` (row kebab "Kebab toggle"); "Cluster facts" is a `<dl>` (use getByLabel);
failure error-context snapshots may show the beforeAll page, check the trace. Favorites section is excluded
from the DSC-1 sidebar comparison (user section, OCP parity). Tokens requested with KIND_TOKEN_DURATION=1h.
