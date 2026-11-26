# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-26 (CP6 plan approved; BUILD not started — human starts it) · **Current checkpoint:** CP6
**BUILD** (next) · **Branch:** `main`

## Where we are
- CP0–CP5.5 DONE (tags up to cp-5.5a/b); consolinho runs eadc0e0. Nothing pushed.
- CP6 (Hardening) SPEC + DESIGN done and **approved by the human** 2026-11-26: `docs/specs/CP6-hardening.md`
  (56 ACs; §7 records all decisions; "CP6a design"/"CP6b design" lane plans at the end). ADRs 0042–0044.
- Tasks (all `todo`): CP6a BE T-0400..T-0414 + T-0107/T-0108; CP6b FE/QA T-0420..T-0429 + T-0390/T-0128/T-0130/T-0134.
- ROADMAP gained **CP6.5** (namespace UX on option A incl. user-added namespaces in localStorage, G1–G8 generic
  kinds/CRDs/operands/API explorer, metrics datasource wizard + credential wizard) and **CP7** (web terminal).

## Next actions (resume here)
1. Start CP6 BUILD only when the human says so. Lanes: BE-A 0400→0402→0403→0405→0407→0411; BE-B 0404, 0401,
   0406, 0408, 0409, 0410, 0413, 0412, 0107/0108; FE-A 0390→0420→0128→0134; FE-B 0130→0423/0424;
   QA 0421→0422→0425→0426→0427; then T-0414 (security review), T-0428 (after 0401+0403), T-0429.
2. Respect max 3 heavy agents (≤ 2 BE). T-0423 may split once T-0422's axe report exists.
3. After CP6: SPEC CP6.5 (ocp-product-owner), using the ROADMAP CP6.5 entry as brief.

## Needs human
- CP7 token model undecided: FleetConsole proxy token vs TokenRequest-minted SA token (both in ROADMAP CP7).
- T-0412: enabling user-workload monitoring on consolinho may need cluster-admin (deploy check skippable).
- Push `main` + tags to a remote? (not done.) CP2 H1–H6 manual checks on real clusters still open.
- CP3.6 reference console: `scripts/ocp-ref/run-console.sh` needs a live `oc login` — `docs/dev/OCP-REFERENCE.md`.

## Follow-ups (optional, not filed)
- `scripts/ui-probe.mjs` uses one `/tmp` PID file for every worktree → make it per-worktree (T-0175).
- prettier printWidth 110 vs code ~120 → one-commit reformat or set 120 (T-0147 review).
- BE: T-0324 PVC expand should accept JSON Patch content type; DatabaseMigrator shared lock helper (T-0231).
- Shared UI: ResourceLink 18px vs OCP 21px; ConditionsTable empty state → small centred ConsoleEmptyState.
- `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` 13.6.5 → 17.x once stable (ADR-0025).

## Cleanup done 2026-11-26
- All 32 agent worktrees + `worktree-agent-*` branches removed (every task commit verified in `main`); 7 stale Aspire PG
  volumes removed (kept eaee001e99, e80e1f9815, e06697cbe8); kubeconfig backup deleted; `cp/*` branches kept.
- Deploy gotcha: a build queued by an earlier run (login expired mid-deploy) blocks the Serial BuildConfig → the next
  `deploy-dev.sh` times out and cancels its build. Check `oc -n consolinho get builds` and wait/cancel before re-running.

## Gotchas
- **Checkpoint close-out:** gate + merge + tag + deploy in a *clean* `git worktree` at the tag (`deploy-dev.sh` builds the
  working tree). The worktree gets its **own** `npm ci` — never symlink node_modules and then `npm ci`: it wipes the
  main tree's `web/node_modules` (happened 2026-11-25; fix = `npm ci` in main `web/`). `git worktree remove --force` after.
- Verify staged changes before committing: `git checkout-index` into the scratchpad + symlinked node_modules, run tsc/eslint/vitest there.
- e2e files are typechecked via `tsconfig.node.json`; editor diagnostics on them can be stale — trust `tsc -b`.
- Subagents: **read-only git** in the shared tree; orchestrator commits by explicit paths. Engineers must not run
  prettier on whole directories. Agent worktrees start from `main` → `git merge --ff-only cp/<n>-…` first.
- Usage limits stop agents mid-task: resume with SendMessage in-session; across sessions start fresh from the task file.
- Max 3 heavy agents at once (≤2 BE) — laptop memory.
- Agents' wait loops: never `pgrep -f <name>` inside `bash -c` (matches itself, never exits).
- Token discipline: `scripts/check-{be,fe}.sh` (logs in `.git/checks/`), LSP plugins (csharp-ls 0.28.0, typescript-language-server),
  hook blocks unfiltered `cat` > 40 KB. Older worktrees lack `scripts/`: run `/home/bad/works/console/scripts/check-*.sh`.
- Podman: `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman`.
  Api on :5180; web port per run (`aspire describe`). Dev PG max_connections 650.
- Test projects use `xunit.v3.mtp-off`. Never name a folder/namespace after a BCL root. DTO `Dto` suffix stripped in OpenAPI.
- Endpoint/DTO XML docs flow into OpenAPI → `schema.gen.ts`; regenerate with `cd web && npm run gen:api` (Api running).
- API JSON: strict numbers, camelCase enum strings. Pipeline: Logging → Authorization → ReadOnlyGuard → Validation → UnitOfWork.
- DbContext retry strategy: explicit transactions inside `CreateExecutionStrategy().ExecuteAsync`; tests saving outside HTTP need `CreateSignedInScope()`.
- FE tests: first full-app render per file is slow → `test/coldStart.ts`; `user.paste` for search inputs; PF Table is
  `role="grid"`; jsdom 1024px vs PF xl 1200px → `mockViewportWidth`; mounting Logs needs `stubLogViewerLayout`.
- `/health`, `/alive`, `/openapi/v1.json` are Development-only. SPA CSP must allow `img-src 'self' data:` (inlined logos).
