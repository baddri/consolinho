---
id: T-0063
title: Upgrade Aspire 13.6.5 → 17 (SDK, hosting/client packages, CLI) with ADR-0025
status: done
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [docs/adr/0025-*.md, docs/adr/README.md, Directory.Packages.props, src/FleetConsole.AppHost/, src/FleetConsole.ServiceDefaults/, src/FleetConsole.Api/Program.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, README.md, docs/dev/TROUBLESHOOTING.md, CLAUDE.md]
review_rounds: 0
---

## Goal
Requested by the human (2026-11-20): move the project from Aspire 13.6.5 to Aspire 17 (latest stable 17.x).
HANDOVER had "don't `aspire update`; needs an ADR" — this task is that ADR plus the upgrade.

## Scope
- In: ADR-0025 (why, what changed between 13 and 17 that affects us, breaking changes handled, rollback = revert the
  commit). `Aspire.AppHost.Sdk` + all `Aspire.*` packages to the same 17.x version in `Directory.Packages.props` and the
  AppHost csproj; any API changes in AppHost (Postgres, JavaScript/Vite resource, DevOAuth wiring), ServiceDefaults and
  the Npgsql EF integration; Aspire CLI to a matching 17.x (dotnet tool / CLI bundle — record exactly how in README
  and TROUBLESHOOTING); update HANDOVER-referenced commands in README if they change (`aspire run`, `aspire start
  --launch-profile http`, `aspire wait web`, `aspire stop`, `aspire describe`).
  Update the "Aspire 13" mention in CLAUDE.md's stack table.
- Out: any other package upgrades (.NET SDK, EF, YARP) unless Aspire 17 strictly requires them — then say so in ADR.

## Context pack
- Current pins: `Directory.Packages.props:11-23`, `src/FleetConsole.AppHost/FleetConsole.AppHost.csproj:1-13`
  (`AspireUseCliBundle`). Installed CLI: 13.6.4. Security floor note: GHSA-f7vh-h5g3-7jrh (13.6.5+).
- Release notes / upgrade guide: fetch from learn.microsoft.com / aspire.dev / github.com/dotnet/aspire releases.
- Podman env: `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman`.

## Acceptance criteria
- [x] ADR-0025 written and indexed.
- [x] All Aspire packages + SDK on one 17.x version; `scripts/check-be.sh` passes. *Deviation:* SDK replaced by
      Microsoft.NET.Sdk + Aspire.Hosting.AppHost 17.0.0; Aspire.Npgsql.EntityFrameworkCore.PostgreSQL stays 13.6.5 (no stable 17.x; ADR-0025 §3).
- [x] `aspire start --launch-profile http && aspire wait web` brings up Postgres, DevOAuth, Api, web; Api `/health` green;
      `aspire stop` stops it (or the 17.x equivalents, documented).
- [x] `cd web && npm run gen:api` still works against the running Api (diff = pre-existing proxy-audit enum drift only, reverted; see Handover).
- [x] README/TROUBLESHOOTING/CLAUDE.md updated.

## Work log
- 2026-11-20 backend-engineer: in_progress → in_review. Researched 17.0.0 (GA 2026-11-18). CLI 13.6.4 → 17.0.0 via
  install.sh --version. Packages → 17.0.0, AppHost → Microsoft.NET.Sdk + AddDotnetProject (ASPIRE012/CS0618). Npgsql EF
  client kept at 13.6.5 (17 only preview). Outside paths: ProjectFileArchitectureTests DevOAuth-reference test now
  asserts *no* ProjectReference (AppHost adds it by path). Verified aspire start/wait/describe/stop, /health 200, gen:api; check-be green.

## Review
**2026-11-20 backend-architect — APPROVE** (round 1). check-be.sh green in worktree.
Verified: v17.0.0 GA 2026-11-18 (microsoft/aspire release notes confirm AddProject/AddCSharpApp/Aspire.AppHost.Sdk
deprecated + CLI bundle required); `AddDotnetProject` relative paths resolve from the AppHost dir (package XML docs);
nuget.org has only `17.0.0-preview.1.26567.5` for the Npgsql EF client. Open advisories (GHSA-f7vh/q6jf/m63f/4g86)
cover CLI/Hosting/Dashboard < 13.6.5 only; none affect the 13.6.5 client. Version split is safe: the client is only in
the Infrastructure/Api graph, the AppHost no longer references Api, so no shared restore graph; no NU warnings suppressed
(only CA1515 in NoWarn). DevOAuth now referenced by no csproj (test enforces) — stronger exclusion than before.
Optional nits:
- docs/adr/0025-upgrade-aspire-17.md:6 — "GitHub release v17.0.0" lives at microsoft/aspire (dotnet/aspire redirects) — name the repo.
- README.md fallback `dotnet run --project src/FleetConsole.AppHost` "not re-verified" — verify once or drop the line.
- Known open issue microsoft/aspire#22361 (DCP fails when AppHost runs from VS 2026; CLI fine) — worth a TROUBLESHOOTING line if anyone uses VS.
- docs/adr/0010:58 still shows `AddProject<Projects.FleetConsole_DevOAuth>` — accepted ADR, historical; leave as is.

## Handover notes
- CLI on this machine is now 17.0.0 (`curl -sSL https://aspire.dev/install.sh | bash -s -- --version 17.0.0 --skip-path`);
  a 13.x CLI can't run the new AppHost and the 17 CLI was not tried against the old 13.6.5 AppHost in the shared tree.
- AppHost has no ProjectReferences / `Projects.*` any more; projects are added by path (`AddDotnetProject`).
- Follow-ups: bump Aspire.Npgsql.EntityFrameworkCore.PostgreSQL when a stable 17.x ships; optionally replace manual
  `Console__PublicOrigin` wiring with endpoint `PrimaryBrowserOrigin`.
- `npm run gen:api` on cp/2-proxy-browser shows pre-existing drift in schema.gen.ts (`AuditCategory` += "proxy",
  `AuditTargetType` += "kubernetesResource") unrelated to Aspire — reverted here; regenerate in the owning task.
- Postgres default image 18.3 → 18.6 (minor); existing dev volume started fine.
