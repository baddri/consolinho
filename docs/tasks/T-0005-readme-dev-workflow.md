---
id: T-0005
title: README and verified developer workflow
status: done
owner: backend-engineer
checkpoint: 0
depends_on: [T-0004]
paths: [README.md, docs/dev/, CLAUDE.md]
review_rounds: 0
---

## Goal
A new developer (or Claude session) can go from clone to running app and green tests by following README.md.

## Scope
- Root `README.md`: what FleetConsole is (2 paragraphs), prerequisites (.NET 10 SDK, Aspire CLI, Node 22, podman),
  podman socket + env vars, `aspire run`, URLs (dashboard, web, api), running tests, regenerating API types,
  repo map, links to CLAUDE.md / docs / SDLC.
- Actually perform the steps: start `aspire run` in the background, confirm Postgres, Api `/health` and the web dev
  server respond, then stop it. Record exact commands/outputs in the Work log; fix doc steps that didn't work.
- `docs/dev/TROUBLESHOOTING.md` for issues hit along the way.

## Acceptance criteria
- [x] Spec CP0 criterion 9 satisfied; criterion 7 demonstrated with recorded evidence
- [x] Build + tests green

## Work log
- 2026-11-18 backend-engineer: started. Read CLAUDE.md, OVERVIEW, ADR-0007, CP0 spec, T-0001..T-0004 handover notes.
- 2026-11-18 Environment: .NET SDK 10.0.113, Aspire CLI 13.6.4 (AppHost SDK 13.6.5), Node 22.23.1, podman 5.8.9,
  fish 4.6 login shell. Nothing listening on 5180/15274; no FleetConsole containers running (data volume from earlier runs present).
- 2026-11-18 Podman check: `systemctl --user is-active podman.socket` → `active`; `is-enabled` → `enabled`;
  `/run/user/1000/podman/podman.sock` exists. The env vars were **not** set in a fresh shell (they must be exported by the developer).
- 2026-11-18 `aspire ls` from repo root → finds `src/FleetConsole.AppHost/FleetConsole.AppHost.csproj` (buildable), so
  `aspire run` from the root works (open point from T-0001 closed).
- 2026-11-18 Run 1, exactly as documented (default = https profile), backgrounded with output to a log:
  `export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman; aspire run --non-interactive &`
  Output: `Trusting certificates... ⚠️ Developer certificates may not be fully trusted (trust exit code was: PartiallyFailedToTrustTheCertificate)`,
  `Building AppHost...`, `Dashboard: https://localhost:17297/login?t=…`. It works non-interactively; no need for the
  `dotnet run --project … --launch-profile http` fallback (kept in README as an alternative).
  `aspire describe --format Json` after ~60 s:
  `api Running Healthy [http://localhost:5180, https://localhost:7180]`, `consoledb Running Healthy`,
  `postgres Running Healthy [tcp://localhost:41101]`, `web-installer Finished`, `web Running Healthy [http://localhost:45697]`.
  - Postgres: `podman exec postgres-… pg_isready` → `accepting connections`;
    `select * from __ef_migrations_history` → `20261118130314_Initial | 10.0.14` (migration applied on startup).
  - Api: `curl http://localhost:5180/health` → `Healthy [200]`; `/alive` → `Healthy [200]`; https `:7180/health` → 200;
    `/api/system/info` → `{"version":"1.0.0+1dd2078…","environment":"Development"} [200]`; `/openapi/v1.json` → 200.
  - Web: `curl http://localhost:45697/` → Vite index.html (`<title>FleetConsole</title>`, `/src/app/main.tsx`);
    deep link `/c/foo/overview` → 200 (SPA fallback); `curl http://localhost:45697/api/system/info` → same JSON, 200 (Vite proxy).
  - Real browser (closes the T-0004 gap): `firefox --headless --screenshot … http://localhost:45697/c/local/overview`
    rendered the PatternFly shell (masthead, cluster switcher, nav, Overview placeholder).
    `aspire otel spans api --format Json` shows `GET /api/system/info` (route `/api/system/info`, child span
    `GetSystemInfoQuery`) with `user_agent.original = Mozilla/5.0 (X11; Linux x86_64; rv:159.0) … Firefox/159.0`, i.e.
    the SPA in the browser called the endpoint through the Vite origin/proxy. (Footer text itself not in the
    screenshot: it sits at the bottom of the full-height sidebar and the screenshot is taken at load.)
  - `cd web && API_URL=http://localhost:5180 npm run gen:api` → `openapi-typescript 7.13.0 … → src/shared/api/schema.gen.ts`; `git status` shows no diff.
  - Stop: `aspire stop --non-interactive` → `✅ … stopped successfully.` DCP took a few more seconds to stop
    Api/dcp processes; then `pgrep -af 'dcp|FleetConsole|vite'` empty and `podman ps` empty. Volume
    `fleetconsole.apphost-eaee001e99-postgres-data` kept (by design).
- 2026-11-18 Run 2, background workflow with the http profile:
  `aspire start --launch-profile http --non-interactive` → `Dashboard: http://localhost:15274/login?t=…`,
  `✅ AppHost started successfully.` (returns in ~6 s); `aspire wait web` → `✅ Resource 'web' is healthy.`
  `aspire describe` → all Running/Healthy, api `http://localhost:5180` only, web `http://localhost:34163`.
  `/health` → Healthy 200; `http://localhost:34163/api/system/info` → JSON 200; dashboard `http://localhost:15274/` → 302 (login);
  `pg_isready` → accepting connections. `aspire stop` → stopped; no processes, no containers afterwards.
- 2026-11-18 Tests (with `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true`):
  `dotnet build FleetConsole.slnx -warnaserror` → 0 warnings, 0 errors.
  `dotnet test FleetConsole.slnx` → Domain 35 passed, Application 35 passed, Api 56 passed (Testcontainers Postgres via podman); container cleaned up.
  Without the env vars: `DockerUnavailableException … Failed to connect to Docker endpoint at 'unix:///var/run/docker.sock'` (recorded in TROUBLESHOOTING).
  Frontend: `npm run lint && npm run typecheck && npm test -- --run && npm run build` → 5 files / 34 tests passed, `✓ built`.
  `dotnet tool restore` → successful; `dotnet ef --version` → 10.0.14.
- 2026-11-18 Docs: wrote `README.md` and `docs/dev/TROUBLESHOOTING.md`. CLAUDE.md "Commands" fixes (outside task
  `paths`, requested by the orchestrator, kept minimal; `paths` updated): `$UID` → `$(id -u)` (empty in fish, the
  login shell here); `gen:api` needs `API_URL=http://localhost:5180` (script default 5000 is wrong); `dotnet ef` needs
  `dotnet tool restore` and `-o Persistence/Migrations` (as verified in T-0004); added the `aspire start/wait/stop`
  background line; pointer to README/TROUBLESHOOTING.
- 2026-11-18 Status → in_review.

## Review
- 2026-11-18 backend-architect: **APPROVE** (round 1).
  - Spot-checked against `src/FleetConsole.Api/Properties/launchSettings.json` (http 5180, https 7180+5180),
    `src/FleetConsole.AppHost/Properties/launchSettings.json` (17297 / 15274, `ASPIRE_ALLOW_UNSECURED_TRANSPORT` on
    http), `global.json` (10.0.100, latestFeature), `web/package.json` (engines >=22.22.0, scripts),
    `.config/dotnet-tools.json` (dotnet-ef 10.0.14), AppHost `Program.cs` (WithDataVolume, AddViteApp installer),
    ServiceDefaults (`/health`, `/alive` Development-only), test csprojs (`xunit.v3.mtp-off`). All consistent.
  - Spec CP0 criterion 9 covered (podman socket, env vars, `aspire run`, tests, links to CLAUDE.md/docs); criterion 7
    evidence in the Work log is concrete (describe output, curls through the Vite proxy, browser span in Api traces).
  - ADR-0007 consistency: README describes login via host-cluster OpenShift OAuth and states login and
    `FleetConsole.DevOAuth` arrive in CP1; matches ADR-0007 and ROADMAP.
  - Orchestrator fix (5000 → 5180 in `web/vite.config.ts` and `web/scripts/gen-api.mjs`): correct, matches the Api
    launch profiles (5180 is bound under both profiles); README/TROUBLESHOOTING/CLAUDE.md no longer require `API_URL`.
    The "Found, not fixed" handover item about 5000 is therefore resolved.
  - Fixed during review (trivial): `web/vite.config.ts` comment said "default Kestrel port" → "launch-profile port
    (5180)"; `docs/dev/TROUBLESHOOTING.md` gen:api entry had a duplicated "needs Development" sentence, tightened.
  - Checks run: `dotnet build FleetConsole.slnx -warnaserror` 0 warnings/0 errors; `npm run lint`, `typecheck`,
    `build` green.
  - Optional nits: historical T-0003 task text still mentions 5000 (fine as history); the "Not verified" note on
    whether `ASPIRE_CONTAINER_RUNTIME` is required could become a follow-up check, no action needed now.

## Handover notes
- **Done:** `README.md` (what it is, prerequisites, podman socket + env vars, `aspire run`, URLs, background workflow,
  tests, gen:api, migrations, repo map, links); `docs/dev/TROUBLESHOOTING.md`; minimal CLAUDE.md Commands fixes.
  CP0 criterion 7 demonstrated twice (https default and http profile) including a real (headless Firefox) browser
  load whose `/api/system/info` call is visible in the Api's traces; criterion 9 satisfied.
- **Recommended dev/agent workflow:** `aspire start --launch-profile http` → `aspire wait web` → `aspire describe` for
  URLs → `aspire stop`. This replaces the SIGTERM dance from T-0004 for background use. `aspire otel spans api` is a
  handy way to verify requests reached the Api.
- **Found, not fixed (outside scope, no src/web changes):**
  - `web/scripts/gen-api.mjs` and the `web/vite.config.ts` proxy fallback default to `http://localhost:5000`, but the
    Api's launch profiles (and Aspire) use 5180. Suggest a small frontend follow-up to default both to
    `http://localhost:5180`; then the `API_URL=` prefix in README/CLAUDE.md can be dropped.
  - The Api serves nothing at `/` yet (no SPA hosting); expected until the deployment task (ADR-0006).
- **Gotchas:** `$UID` is empty in fish; dev cert trust partially fails on Fedora (use the http profile); the Aspire CLI
  announces 17.0.0: don't run `aspire update`; Postgres tables are snake_case incl. `__ef_migrations_history`; the
  web port changes every run.
- **Not verified:** that `ASPIRE_CONTAINER_RUNTIME`/`DOCKER_HOST` are strictly needed for `aspire run` (with no Docker
  installed DCP may auto-detect podman); the README keeps them because they're harmless and Testcontainers needs `DOCKER_HOST`.
  Pinned install of an older Aspire CLI was not tried.
