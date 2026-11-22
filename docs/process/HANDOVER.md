# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-22 (CP3.6 CLOSED) · **Current checkpoint:** CP3.7 — Fleet foundations (BUILD) ·
**Branch:** `main` (CP3.7 work goes on `cp/3.7-fleet-foundations`)

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
- **CP3.7 BUILD (2026-11-23):** spec `docs/specs/CP3.7-fleet-foundations.md` (Q1 decided: one-line toggle), ADRs
  0032–0035, UX.md §2a (K8s navy theme), tasks BE T-0139→T-0142 (sequential), FE T-0144…T-0151 (deps in frontmatter;
  T-0146 waits for all BE). Done: T-0139 (1a9e210), T-0144 (73ac7e3), T-0140 (84ca7f2), T-0141 (716b5d7). In progress: T-0142 (backend-engineer), T-0145 (frontend-engineer, fix round 3). Follow-ups filed: T-0152 menu width, T-0153 switcher keyboard nav (design first; before VERIFY).
- **CP3.7 scope (human, 2026-11-23)** — ROADMAP §CP3.7 holds the decided scope (switcher display name/type tag, read-only
  off the toggle, `Cluster.Distribution` + discovery gating, Fleet perspective, K8s masthead theme, multi-namespace token
  test, 4 ADRs). SPEC with `ocp-product-owner` + `ux-designer` (theme values). Groups + cache decided for CP4.5, K8s
  onboarding CP5.5 (ROADMAP). Then CP4 as below.
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
