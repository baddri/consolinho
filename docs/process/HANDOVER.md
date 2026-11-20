# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-20 (CP2 started) · **Current checkpoint:** CP2 — Proxy, cluster switcher & generic resource
browser (MVP) · **Branch:** `cp/2-proxy-browser`

## Where we are
- **CP0 Foundations: DONE** (tag `cp-0`). **CP1 Identity & administration: DONE** (tag `cp-1`, merged to `main`).
- CP1 evidence: QA `docs/specs/CP1-qa-report.md` (66/70 automated + H1–H4 browser checks passed by the human 2026-11-20,
  0 bugs); acceptance `docs/specs/CP1-acceptance.md` (accepted with follow-ups).
- Working tree clean, no worktrees.

## Next actions (resume here)
1. (done) branch created; ROADMAP CP2 → `in_progress`.
2. SPEC + DESIGN done. BE: ADR-0019..21, T-0056..62 (56/57/58 ∥ → 59/60 ∥ → 61 → 62 QA). FE: ADR-0022..24, T-0070..79
   (70→71 ∥ 72; then 73 → 74 ∥ 75 → 76 → 77; 78 after 75; 79 after 60). T-0054 now depends on T-0061+T-0073 (QG-4 step).
   BUILD: T-0058 (3378b32), T-0056 (1a21868), T-0057, T-0072, T-0070 (6409194), T-0060 (8ba7b49), T-0059 (e9fc417), T-0071 (580eb53), T-0061 (8fbd137), T-0079, T-0063 Aspire 17 (882884f), T-0073 (17178bc), T-0062 (3c05ad5) done. Running: T-0090 bug fix (CP2-blocking: flush watch headers early; shared tree src/), T-0075 (shared tree), T-0074 + T-0054 (worktrees). CP2 must not close before T-0078 (cluster landing needs the Projects descriptor). T-0053, T-0055 done.
   CSP needs (CP3): `img-src 'self' data:`, Monaco `worker-src 'self'` + `style-src 'unsafe-inline'`.
   matrix extended to proxy routes; proxy strips the client `Authorization` header; switcher search/recents.
3. DESIGN → BUILD per SDLC. CP2 tasks already filed: T-0053 (rename admin area to "Fleet administration"),
   T-0054 (Playwright smoke H1–H4, self-seeding).
4. Carried optional nits (fold into nearby CP2 work or drop): T-0016 (map unique-constraint race → `Users.UsernameTaken`;
   shared `MeStatusAsync` test helper); T-0019 (bulk else-branch should match `GrantErrors.AlreadyExists` explicitly;
   `ArgumentNullException.ThrowIfNull(api)` in ClustersEndpoints); T-0041 ("To" date defaults 00:00 → 23:59; typeahead
   skeleton test name); T-0040 (production rows use selected-row styling; >100 bulk rows unguarded); T-0036 follow-up
   "load token from file" into the masked input.

## How the human can test (current state)
- `dotnet test FleetConsole.slnx` / `cd web && npm test -- --run`.
- `aspire run` → real login via DevOAuth (users admin/alice/bob/ines); admin data APIs land with T-0016..T-0021.
- After T-0042 lands: `cd web && npm run dev:mock` (`?mockUser=alice|bob|ines|admin|none`) — whole UI without backend.

## Open for product owner at ACCEPT
- (decided at ACCEPT: rename to "Fleet administration" in CP2, T-0053)

## Needs human
- (none) — optional: confirm product name "FleetConsole" before CP3 (image/Route names).

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
- T-0091 (CP4): send exec/attach upgrades upstream as HTTP/1.1 (today HTTP/2 extended CONNECT; real kube-apiserver risk).
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
