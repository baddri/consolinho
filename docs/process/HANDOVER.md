# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-23 (CP3.7 CLOSED) · **Current checkpoint:** CP4a — Pods + Deployments (BUILD) ·
**Branch:** `cp/4-workloads`

## Where we are
- CP0–CP3.5 DONE (tags cp-0..cp-3, cp-3.5). Test deployment was torn down (CP3 H7); redeploy with
  `scripts/deploy-dev.sh --yes`.
- Human (2026-11-21): name `consolinho`; deploy to the current `oc` login, ns `consolinho`; orchestrator/QA may run
  `scripts/deploy-dev.sh --yes` there (spec DEV-1 exception); `--teardown` human-only. Test cluster changes often.
- CP3.5 (OCP look & feel): T-0110…T-0117 done; QA pass (check-fe 729, e2e 9/9 incl. `web/e2e/layout.e2e.ts`); PO
  ACCEPT WITH FOLLOW-UPS (`docs/specs/CP3.5-acceptance.md`). New agent `ux-designer`, rules `docs/architecture/UX.md`,
  ADR-0031. Every FE task now gets frontend-architect (code) + ux-designer (visual) review.

## Next actions (resume here)
- **Human approval (2026-11-23):** after CP3.7 closes (merge + tag), continue straight into **CP4** without stopping to report; still report CP3.7 delivery in the session summary.
- **CP3.7 DONE** (tag cp-3.7, merged to main): T-0139…T-0154; QA PASS 40/40 (`docs/specs/CP3.7-verify.md`; BE 1830,
  FE 891, e2e 10/10); PO ACCEPT WITH FOLLOW-UPS (`docs/specs/CP3.7-acceptance.md`, in ROADMAP §CP4/§CP5.5).
- **CP4 SPEC done** (`docs/specs/CP4-workloads.md`, split CP4a/b/c, Q1–Q8 recommendations accepted). CP4a DESIGN done: BE T-0155→T-0156→T-0157 (ADR-0036),
  FE T-0170…T-0186 (ADR-0037, lanes in the tasks). ACT-4 tooltip keeps UI-9 copy (orchestrator). Done: T-0170 (aada516; admin's first cluster is now prod-k8s-1), T-0174 (e0eb834; new deps → `npm ci`), T-0155 (97a1cac;
  new `Proxy:StreamIdleSlack`), T-0171 (3586b61), T-0175 (159c25d), T-0173 (1370ab7; gen:api no diff), T-0156 (909f7c3; exec audited at handshake, EventId 2403 session end), T-0172 (6bce4d5; band contrast OK), T-0176 (abc0f99; `useActionAccess`, `useResourceMutation`, `ResourceMutationModal`), T-0178 (a57aaa4; `streamPodLog`, `usePodLog`, mock `mockK8s.appendLog/cutLog`), T-0157 (3693683; BE lane DONE; Api 836), T-0182 (2cdb2a7; modal `description`/`elementToFocus`). T-0177 (a9285bc; modal `variant`/`isSaveDisabled`; plain closable labels per OCP). T-0180 (600796b; exec over `base64.channel.k8s.io`, xterm lazy chunk). T-0183 (bfb764d). T-0179 (f5c4d55; `useFullscreen` moved to `shared/hooks`). T-0181 (39afbfd; `PodStatus` popover; tests mounting Logs need `stubLogViewerLayout`). T-0185 (33ca1c7; `rowFilter` on ResourceDataView; PO to reword DEP-9/10: Rollback hidden while RS has pods, no Pods column). T-0184 (cc34f63; `PodRing` scale arrows, 1 s debounce, rollback on failure). FE build lane DONE. In progress:
  T-0186 (a2535ef; e2e `web/e2e/workloads.e2e.ts`, parity rows). T-0187+T-0188 (e1ee330; Edit <Kind> gated on `update`, ring arrows omitted for RO; e2e 11/11). CP4a ACCEPTED (spec §4a.9), merged to main 1224ec0, tagged cp-4a. CP4b designed (c72416c; T-0189…T-0200 FE/QA, T-0201 BE; lanes in spec §4b.7; OCP-parity deviations accepted by orchestrator). T-0199 done (4fff54b; `shared/ui/TogglePlay`, eslint `@xterm/*` rule). T-0189 done (b806ed3; 8 kinds, nav order = OCP, `workloadFixtures.ts`, mock discovery per-group versions). T-0196 done (915376a; `workloads/config`, `actions` slot on SectionHeading/DetailsSubsection). T-0190 done (28020c1; `workloads/scale`: useEditCountAction/useRestartAction take model, useRelatedHPA `enabled` only in details menu). T-0197 done (b892267; `resources/search`, p-limit 7.3.3 → npm ci, ProjectBar takes descriptor|pathFor). In progress: T-0191, T-0195, T-0198. Next: T-0194, T-0192, T-0193, T-0200. Follow-ups: ProjectBar callers → `pathFor` only; Search result paging + per-kind columns + "Recently used"; check-fe.sh paths are web-relative. Follow-up (CP4c POL): nav divider after ConfigMaps like OCP `WorkloadsSeparator` (nav-model change). Follow-up: `scripts/ui-probe.mjs` hard-wired to :5199 → add a port option; PodLogsTab LOG-2 height test flakes under load. T-0201 done (b94044a; proxy DC/Secret write coverage + CFG-4 leak sweep). Follow-up: AuditLogPage AUD-4 5 s timeout flakes under load (3×); follow-up: `TogglePlay` copied from events → shared/ui (T-0179); follow-up: eslint rule only `shared/ui/terminal` imports `@xterm/*` (T-0180 review); follow-up: shared no-exec reason copy is internal wording (T-0180 UX). Follow-up: T-0183 item sits after Restart rollout (task text said after Edit Pod count). Follow-up: RO tooltip uses cluster name, modal/toast display name (T-0176 UX). cp-4a DEPLOYED to ns consolinho (2026-11-23, 1224ec0, Route consolinho.apps.<current cluster>). Merge + tag per sub-checkpoint (cp-4a…).
0. **CP3.6 DONE** (tag cp-3.6, merged to main). Look = OpenShift glass + felt. Tasks T-0119…T-0136; matrix
   `docs/architecture/ocp-parity.md` all `match`; QA PASS (`docs/specs/CP3.6-verify.md`), PO ACCEPT; human accepted
   waivers W1–W5 (`docs/specs/CP3.6-acceptance.md`). Rule stays: every FE task = engineer → frontend-architect (code) +
   ux-designer (visual, against `scripts/ocp-ref`) in parallel; only the architect runs `check-fe.sh`.
1. CP4 (ROADMAP §CP4): SPEC step with `ocp-product-owner`, branch `cp/4-workloads`. Fold in T-0133 (field-help +
   ring scale, W3/W4), one cluster-OpenAPI capability (YAML schema sidebar W1 + field help), "Edit <Kind>" form editors,
   kind-specific actions, Search page (list labels link to it then; today they link to the filtered list),
   shared `?label=` path helper (T-0136 nit), `itemKey 'edit-yaml'`→`'edit'` (T-0135 nit). Also T-0118 (CP3.5 UX
   follow-ups) and the CP3.5 backlog items in ROADMAP (YAML Cancel/Save, audit labels, structured admin source —
   FE parses strings in `users/adminSource.ts`), plus: `Timestamp`/`DetailsSubsection` → shared/ui + unit test;
   `admin.test.tsx` local `openSidebar` → `web/src/test/sidebar.ts`.
2. CP6 follow-ups: T-0107, T-0108 (CP3), T-0130 (events cache), T-0134 (Favorites modal focus), T-0128 (unfavourite button).
3. Still open from CP2: H1–H6 in `docs/specs/CP2-acceptance.md`.

## How the human can test (current state)
- `aspire start --launch-profile http && aspire wait web` → login via DevOAuth (admin/alice/bob/ines; e2e-user/e2e-admin
  for e2e); `aspire stop`. Mock UI: `cd web && npm run dev:mock` (`?mockUser=alice|bob|ines|admin|none`).
- e2e: with Aspire running, `cd web && npm run e2e`.

## Needs human
- CP3.6 reference console: human chose local `bridge` (2026-11-22); built and verified. The orchestrator starts it with
  `scripts/ocp-ref/run-console.sh` (needs a live `oc login`; the token expires) — `docs/dev/OCP-REFERENCE.md`.
- CP2 H1–H6 manual checks on real clusters. Optional: confirm product name before CP3 (image/Route names; UI brand is
  "Consolinho" since T-0055).
- Leftover podman volume `fleetconsole.apphost-aff1e2f998-postgres-data` (T-0054 worktree) — safe to remove.

## Follow-ups (optional, not filed)
- `scripts/ui-probe.mjs` uses one `/tmp` PID file for every worktree → a stale :5199 server from another worktree blocks the probe (T-0175); make it per-worktree.
- T-0174 review: move mock-only cases (400/422, scale validation) from `shared/k8s/client.test.ts` to the mock test file.
- T-0147 review: prettier printWidth 110 vs code ~120 → one-commit reformat or set 120 (churn on every touched file).
- T-0090 review: explicit `proxyResponse is not null` in flush condition; tests watch→unreachable (502), watch→401.
- T-0093 review: extend Connection test with `Authorization` nominated, assert bearer still sent.
- T-0078 review: shared DetailItem used by PodDetails; `labelSelectorString` ignores matchExpressions.
- T-0075/T-0078: Pod details Node link + init containers. `ProxyErrors` *Code constants (T-0061).
- `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` 13.6.5 → 17.x once stable (ADR-0025).

## Gotchas
- **Token discipline (2026-11-19):** check scripts `scripts/check-{be,fe}.sh` (full logs in `.git/checks/`), `LSP` tool via
  project plugins csharp-lsp + typescript-lsp (binaries: `csharp-ls` 0.28.0 dotnet tool symlinked into `~/.local/bin` —
  0.29.0 fails to install; `typescript-language-server` in `~/.local`), hook `.claude/hooks/guard-bulk-cat.py` blocks
  unfiltered `cat` > 40 KB. Delegation prompts carry a *context pack* (SDLC.md).
  Worktrees on older bases lack `scripts/`: run `/home/bad/works/console/scripts/check-*.sh` from inside the worktree.
- **Agent worktrees start from `main`**: tell worktree agents to `git merge --ff-only cp/<n>-…` first; orchestrator commits in the worktree, then cherry-picks onto the cp branch.
- Agents' background wait loops: never `pgrep -f <name>` inside `bash -c` — it matches the loop's own command line and never exits (a reviewer loop ran 5 h on 2026-11-20).
- **Subagents: read-only git only** in the shared tree (SDLC.md). Orchestrator commits by explicit paths.
- Project agents (`.claude/agents/`) are available natively in a new session. Usage limits stop agents mid-task — within a
  session resume with SendMessage; across sessions start a new agent from the task file's Handover notes.
- Agent worktrees with no changes are auto-deleted when the agent stops; worktrees with changes persist.
- Commit 6c2262f (T-0025) alone doesn't build (UserMenu deletion); fixed by T-0027's commit.
- No docker: podman. Export `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman` (fish: `$(id -u)`, not `$UID`).
- Background runs: `aspire start --launch-profile http && aspire wait web`; `aspire stop`. Api on :5180; web port per run (`aspire describe`).
- Aspire 17.0.0 (ADR-0025): AppHost is plain Microsoft.NET.Sdk + `AddDotnetProject` by path; CLI 17 via aspire.dev install script. `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` stays 13.6.5 until a stable 17.x exists — bump then. Microsoft Aspire skills plugin enabled in project settings (telemetry hooks removed from user settings at the human's request).
- Test projects must use `xunit.v3.mtp-off`.
- Never name a folder/namespace after a BCL root. DTO `Dto` suffix stripped in OpenAPI schema names (no `Foo` + `FooDto` pair).
- Endpoint/DTO XML docs flow into OpenAPI → `schema.gen.ts`; regenerate with `cd web && npm run gen:api` (Api running, Development).
- API JSON: strict numbers, enums camelCase strings. Pipeline: Logging → Authorization → ReadOnlyGuard → Validation → UnitOfWork.
- DbContext retrying strategy: explicit transactions inside `CreateExecutionStrategy().ExecuteAsync`. Saving outside HTTP in
  tests needs `CreateSignedInScope()` (audit requires an actor). Integration harness usage: see T-0015 Handover notes.
- FE tests: first full-app render per file is slow under load → `test/coldStart.ts`; prefer `user.paste` for search inputs;
  PF Table has `role="grid"`; jsdom 1024px vs PF xl 1200px → `mockViewportWidth`.
- Follow-up F1 (T-0013 review): harden `AuditEntry.Actor` against shared instances.
- `/health`, `/alive`, `/openapi/v1.json` are Development-only — revisit for OpenShift probes (CP3).
- **CP3 follow-ups:** callback URL (code/state) must never reach request-line logs / OTel `url.query` — enforce in code (T-0015);
  host CA bundle = SA `ca.crt` + OAuth-route ingress CA, OAuth metadata refresh (T-0014); DP-cert-missing warning → startup
  error, key-encryption cert rotation, runbook (T-0012); Containerfile publishes only `src/FleetConsole.Api`, assert no
  `FleetConsole.DevOAuth*` (T-0009); "new version — reload" on chunk-load failure (T-0028).
- **CP4 (logs follow):** forwarding pool retires old handlers 6 min after an admin cluster edit → long-followed log streams cut then (T-0058 review).
- Optional nit (T-0061): `ProxyErrors` `*Code` constants instead of string literals in `KubernetesProxyEndpoint.cs:217-219`, `ProxyProblems.cs:91-96`.
- **CSP (CP3/CP6):** logos are inlined as `data:` URIs → SPA CSP must allow `img-src 'self' data:` (T-0055 review).
- **CP2 follow-ups:** pooled handlers need a fresh `TlsValidationRecord` per connection; fake apiserver needs prefix routes + streaming bodies (T-0010).
