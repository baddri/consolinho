# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-19 (session ended by human mid-wave) · **Current checkpoint:** CP1 — Identity & administration ·
**Branch:** `cp/1-identity-admin`

## Where we are
- **CP0 Foundations: DONE** (tag `cp-0`).
- **CP1 loop step: BUILD.** Design complete: backend T-0007..T-0021 (+T-0044), frontend T-0022..T-0043 (+T-0045, T-0046),
  ADR-0008..0018, contract `docs/specs/CP1-api-contract.md` (orchestrator amendments 2026-11-18/19 inline).
- Committed & approved: T-0007..T-0015, T-0044 (backend); T-0022..T-0030, T-0045 (frontend).
  Real OpenShift-OAuth login works end-to-end against `FleetConsole.DevOAuth` (T-0015).

## ⚠ Uncommitted work-in-progress (session was stopped mid-task)
Five tasks were interrupted. Each **task file has a Work log + Handover notes** written at stop time — read them first.

| Task | Where the WIP lives | State at stop |
|---|---|---|
| T-0042 `npm run dev:mock` | main tree: `web/package.json`, `web/vite.config.ts`, `web/msw/`, `web/src/mocks/browser.ts`, `web/src/app/main.tsx`, `web/src/app/session.ts`, `web/eslint.config.js`, `web/.prettierignore`, **moved** `features/auth/{returnUrl,loginPath}*` → `web/src/shared/auth/`, `features/auth/{index.ts,LoginPage.tsx}`, README tail section, FRONTEND.md | Round-1 fixes DONE, last checks green. Left: optional browser recheck → re-run checks → `in_review` → frontend-architect round 2 |
| T-0046 flaky FE tests | main tree: `web/src/test/coldStart.ts`, `web/src/app/{router,session}.test.tsx`, `web/src/app/layout/AppShell.test.tsx`, `web/src/features/admin/admin.test.tsx`, `web/src/features/admin/users/UsersListPage.test.tsx`, FRONTEND.md testing bullet | Work DONE; stress check 10/10 green (one pair invalidated by T-0042's file move, re-run green). Left: re-run checks → `in_review` → frontend-architect review |
| T-0016 admin users API | main tree: `src/FleetConsole.Application/Users/`, `Api/Endpoints/Admin/{UsersAdminEndpoints,UserRequests,AdminEndpoints}.cs`, `Api/OpenApi/{StringEnumSchemaTransformer,OpenApiSetup}.cs` | All 7 use cases + endpoints written, Application+Api projects build. Left: full build (EF translation of `UserRow` projection), all tests, `Enums_AreCamelCaseStrings` tighten, regenerate schema.gen.ts |
| T-0017 admin clusters API | **worktree** `.claude/worktrees/agent-a9928235423746737` (branch `worktree-agent-a9928235423746737`, base b1f8062) | Get/List/Register/Update use cases written. Left: Enable/Disable/Delete, Api endpoints, ServiceProviderBuilder fakes, all tests, schema regen (worktree needs `npm ci`). Open: EF translation of list projection; make `environment` required (400 not default); confirm trimming of displayName/description |
| T-0018 admin credentials API | **worktree** `.claude/worktrees/agent-af76dd13c9f3efd52` (branch `worktree-agent-af76dd13c9f3efd52`, base b1f8062) | Application layer written (tokens/fingerprint/inspector, DTO with `expiryWarningDays`, 5 use cases), builds alone. Left: Api endpoints, ServiceProviderBuilder registration (likely merge conflict with T-0016/17), tests incl. TokenLeakScanner, `TestData` → `TokenFingerprints.Compute`, schema regen. Deviations to rule on: unreadable JWT `exp` → opaque/`unknown`; printable-ASCII token rule |

**Commit hygiene:** commit each task by explicit paths, never `git add -A`. `README.md` = T-0042 tail section only (T-0015's
part is already committed). `docs/architecture/FRONTEND.md` has edits from both T-0042 and T-0046 — commit it with whichever
lands first. The T-0042 file move means T-0046's and T-0042's web changes should be checked together (full web checks) before
committing either.

## Next actions (resume here)
1. `git status` + `git worktree list`; read Handover notes of T-0042, T-0046, T-0016, and (inside each worktree) T-0017, T-0018.
2. Resume each interrupted task with a **new** agent of the same type, pointing it at its task file's Handover notes
   (worktree tasks: tell the agent the worktree path and to work only there).
3. Reviews: T-0042 round 2 + T-0046 (frontend-architect); T-0016/17/18 round 1 (backend-architect; worktree reviews inside the worktree).
4. Merge worktrees after approval: commit inside the worktree → `git merge --no-ff` into `cp/1-identity-admin` → expect
   conflicts in `Api/Endpoints/Admin/AdminEndpoints.cs`, DI files, `schema.gen.ts` → resolve, **regenerate schema.gen.ts**
   (Api running) + `cd web && npm run typecheck` → full backend + frontend checks → `git worktree remove` + delete branch.
5. Then W6 rest: T-0019 (grants + GET /api/clusters), T-0021 (audit query) → T-0020 (connection test).
   Frontend next: T-0031, T-0033, T-0034, T-0041, then T-0032, T-0035…; T-0043 (integration) last.
6. VERIFY (qa-engineer) → ACCEPT (ocp-product-owner) → CLOSE per `docs/process/SDLC.md`.

## How the human can test (current state)
- `dotnet test FleetConsole.slnx` / `cd web && npm test -- --run`.
- `aspire run` → real login via DevOAuth (users admin/alice/bob/ines); admin data APIs land with T-0016..T-0021.
- After T-0042 lands: `cd web && npm run dev:mock` (`?mockUser=alice|bob|ines|admin|none`) — whole UI without backend.

## Open for product owner at ACCEPT
- Nav naming: sidebar "Admin" vs spec ADM-3 "Administration" (cluster nav already has "Administration").

## Needs human
- (none) — optional: confirm product name "FleetConsole" before CP3 (image/Route names).

## Gotchas
- **Token discipline (2026-11-19):** check scripts `scripts/check-{be,fe}.sh` (full logs in `.git/checks/`), `LSP` tool via
  project plugins csharp-lsp + typescript-lsp (binaries: `csharp-ls` 0.28.0 dotnet tool symlinked into `~/.local/bin` —
  0.29.0 fails to install; `typescript-language-server` in `~/.local`), hook `.claude/hooks/guard-bulk-cat.py` blocks
  unfiltered `cat` > 40 KB. Delegation prompts carry a *context pack* (SDLC.md).
  Worktrees on older bases lack `scripts/`: run `/home/bad/works/console/scripts/check-*.sh` from inside the worktree.
- **Subagents: read-only git only** in the shared tree (SDLC.md). Orchestrator commits by explicit paths.
- Project agents (`.claude/agents/`) are available natively in a new session. Usage limits stop agents mid-task — within a
  session resume with SendMessage; across sessions start a new agent from the task file's Handover notes.
- Agent worktrees with no changes are auto-deleted when the agent stops; worktrees with changes persist.
- Commit 6c2262f (T-0025) alone doesn't build (UserMenu deletion); fixed by T-0027's commit.
- No docker: podman. Export `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman` (fish: `$(id -u)`, not `$UID`).
- Background runs: `aspire start --launch-profile http && aspire wait web`; `aspire stop`. Api on :5180; web port per run (`aspire describe`).
- Aspire pinned to 13.6.5 (advisory on 13.6.4). CLI offers 17 — don't `aspire update`; needs an ADR.
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
- **CP2 follow-ups:** pooled handlers need a fresh `TlsValidationRecord` per connection; fake apiserver needs prefix routes + streaming bodies (T-0010).
