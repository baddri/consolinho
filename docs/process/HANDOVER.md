# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-20 (CP2 closed) · **Current checkpoint:** CP3 — Deploy to OpenShift (not started) ·
**Branch:** `main`

## Where we are
- **CP0: DONE** (`cp-0`). **CP1: DONE** (`cp-1`). **CP2 Proxy, cluster switcher & generic resource browser: DONE**
  (tag `cp-2`, merged `--no-ff` to `main`). Not pushed (no remote push without the human).
- CP2 evidence: `docs/specs/CP2-acceptance.md` — 55/55 ACs after T-0093 (SEC-1) fix; PO ACCEPT-WITH-FOLLOWUPS.
  Human checks H1–H6 against real clusters are listed there and still open.
- Gates at close: check-be 325/684/711 (0 skipped), check-fe 693 tests, e2e 6/6.
- Working tree clean, no worktrees.

## Next actions (resume here)
1. Human: run CP2 H1–H6 (`docs/specs/CP2-acceptance.md`) on real clusters; report failures as bug tasks.
2. Start CP3 (ROADMAP): branch `cp/3-deploy`, ROADMAP CP3 → `in_progress`, SPEC (ocp-product-owner) → DESIGN.
   Fold in T-0092 (SPA security headers/CSP) and T-0094 (flaky DevOAuth config test).
3. Later-checkpoint tasks already filed: T-0091 (CP4 exec over HTTP/1.1), T-0095/T-0096 (CP4 UI), T-0097 (CP6).

## How the human can test (current state)
- `aspire start --launch-profile http && aspire wait web` → login via DevOAuth (admin/alice/bob/ines; e2e-user/e2e-admin
  for e2e); `aspire stop`. Mock UI: `cd web && npm run dev:mock` (`?mockUser=alice|bob|ines|admin|none`).
- e2e: with Aspire running, `cd web && npm run e2e`.

## Needs human
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
