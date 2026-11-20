---
id: T-0063
title: Upgrade Aspire 13.6.5 → 17 (SDK, hosting/client packages, CLI) with ADR-0025
status: todo
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
- [ ] ADR-0025 written and indexed.
- [ ] All Aspire packages + SDK on one 17.x version; `scripts/check-be.sh` passes.
- [ ] `aspire start --launch-profile http && aspire wait web` brings up Postgres, DevOAuth, Api, web; Api `/health` green;
      `aspire stop` stops it (or the 17.x equivalents, documented).
- [ ] `cd web && npm run gen:api` still works against the running Api (no diff expected in schema.gen.ts).
- [ ] README/TROUBLESHOOTING/CLAUDE.md updated.

## Work log

## Review

## Handover notes
