# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-26 (CP5.5 deployed; CP6 plan awaiting human approval) · **Current checkpoint:** CP6 PLAN ·
**Branch:** `main` (merged 28a6fe8; `cp/5.5-kubernetes-clusters` kept)

## Where we are
- CP0–CP5.5 DONE. Tags: cp-0 … cp-3.7, cp-4a/b/c, cp-4.5a/b, cp-5a/b/c, **cp-5.5a, cp-5.5b** (both on merge 28a6fe8).
  Nothing pushed (pushing needs the human).
- CP5.5 (Kubernetes clusters): spec `docs/specs/CP5.5-kubernetes-clusters.md` §Acceptance = ACCEPTED (all 5 deviations
  accepted). VERIFY T-0391: check-be 2369, check-fe 1677, e2e 60 (+4 kind skipped), kind e2e 4/4 (`E2E_KIND=1`), kind smoke green.
- Human UI fixes T-0370..T-0374 shipped in CP5.5. Local kind: `scripts/kind-dev.sh` (isolated kubeconfig, API :16443).
- Deployed on consolinho: **cp-5.5b** (28a6fe8, build consolinho-19 image sha256:0e69ac67…, 2026-11-26).

## Next actions (resume here)
1. CP6 (Hardening, observability & polish): no spec yet → SPEC step (ocp-product-owner). Schedule T-0390 (discovery
   recovery) before Kubernetes clusters go to production (PO).
2. Backlog: T-0390, T-0380, T-0367, T-0349, T-0350; CP6 follow-ups T-0107, T-0108, T-0130, T-0134, T-0128.

## How the human can test (current state)
- Live: the `consolinho` Route in ns `consolinho` (cp-5.5b). Kubernetes: `scripts/kind-dev.sh` + add the kind cluster in admin.
- Local: `aspire start --launch-profile http && aspire wait web` → login via DevOAuth (admin/alice/bob/ines;
  e2e-user/e2e-admin for e2e); `aspire stop`. Mock UI: `cd web && npm run dev:mock` (`?mockUser=alice|bob|ines|admin|none`).
- e2e: with Aspire running, `cd web && npm run e2e`.

## Needs human
- Push `main` + tags to a remote? (not done.)
- Still open from CP2: H1–H6 manual checks on real clusters (`docs/specs/CP2-acceptance.md`).
- CP3.6 reference console: `scripts/ocp-ref/run-console.sh` needs a live `oc login` (token expires) — `docs/dev/OCP-REFERENCE.md`.

## Follow-ups (optional, not filed)
- `scripts/ui-probe.mjs` uses one `/tmp` PID file for every worktree → make it per-worktree (T-0175).
- prettier printWidth 110 vs code ~120 → one-commit reformat or set 120 (T-0147 review).
- BE: T-0324 PVC expand should accept JSON Patch content type; DatabaseMigrator shared lock helper (T-0231).
- Shared UI: ResourceLink 18px vs OCP 21px; ConditionsTable empty state → small centred ConsoleEmptyState.
- `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` 13.6.5 → 17.x once stable (ADR-0025).
- CP3 hardening still open: callback URL never in logs/OTel (T-0015), DP cert-missing → startup error (T-0012),
  "new version — reload" on chunk-load failure (T-0028), forwarding pool cuts followed logs 6 min after cluster edit (T-0058).

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
