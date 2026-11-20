# 0026 — Container image: UBI 9 .NET 10 (ASP.NET) runtime, three-stage Containerfile, in-cluster binary build
**Status:** Accepted (2026-11-21) · amends ADR-0006 · CP3 spec IMG-1..4, DEV-3, Q2

## Context
ADR-0006 fixed "one container serves API + SPA" but not the base image or how it is built. The target is OpenShift
(`restricted-v2`: arbitrary UID in group 0, read-only root filesystem). The dev deploy builds inside the test cluster,
whose internal registry has no external route, so the image must build with an OpenShift Docker-strategy build and
pull its base images without extra pull secrets. Locally, engineers have podman only.

## Decision
1. **`deploy/Containerfile`, three stages**, build context = repository root:
   - `web`: `registry.access.redhat.com/ubi9/nodejs-22` — copy `web/package.json` + `package-lock.json`, `npm ci`,
     then copy `web/` and `npm run build` (→ `web/dist`).
   - `build`: `registry.access.redhat.com/ubi9/dotnet-100` (SDK) — copy `global.json`, `Directory.*.props`,
     `.editorconfig` and the `*.csproj` of Api + its project references first (restore layer cache), `dotnet restore
     src/FleetConsole.Api`, then copy `src/` and `dotnet publish src/FleetConsole.Api -c Release --no-restore
     -p:UseAppHost=false -o /opt/app-root/app`. Only the Api is published: AppHost, DevOAuth and tests are never in
     the image.
   - `runtime`: `registry.access.redhat.com/ubi9/dotnet-100-aspnet` (amended 2026-11-21, T-0100: for .NET 10
     `dotnet-100-runtime` ships `Microsoft.NETCore.App` only, no ASP.NET Core) — copy the publish
     output to `/opt/app-root/app` and `web/dist` to `/opt/app-root/app/wwwroot`; `chgrp -R 0` + `chmod -R g=u`
     (OpenShift group-0 model); `USER 1001`; `ENV ASPNETCORE_URLS="" ASPNETCORE_HTTP_PORTS=8080` (the base sets
     `ASPNETCORE_URLS`, which would override `HTTP_PORTS`); `CMD []` (the base's `/bin/bash` CMD would become an app
     argument); `EXPOSE 8080`;
     `WORKDIR /opt/app-root/app`; `ENTRYPOINT ["dotnet", "FleetConsole.Api.dll"]`. Arguments after the entrypoint select
     the mode (`migrate`, ADR-0027).
   - Pin each base image to its stream tag (e.g. `ubi9/dotnet-100:10.0`, never `latest`) and pull from
     `registry.access.redhat.com` (anonymous), not `registry.redhat.io` (needs auth). If a `ubi9` .NET 10 tag is unavailable, `ubi10/` equivalents are acceptable
     (same contract); record the chosen tags in the task work log.
     *Amended 2026-11-21 (T-0100):* these repos publish no `10.0`/`22` stream tag and no ubi10 .NET 10 repo exists,
     so all three are pinned to the RHEL-minor stream tag (`:9.9`), which receives z-stream and .NET patch rebuilds
     until the next UBI minor ships; then bump all three together (a stale minor stops receiving security fixes).
2. **Writable paths**: only `/tmp` (an `emptyDir` in the manifests, `--tmpfs /tmp` locally). The app writes nothing
   else (Data Protection keys are in Postgres, ADR-0004).
3. **`.containerignore`** at the repo root: `**/bin`, `**/obj`, `**/node_modules`, `.git`, `web/dist`, `web/coverage`,
   `web/e2e/.results`, `**/TestResults`, `**/.env*`, `**/*.kubeconfig`, `**/kubeconfig`, `**/appsettings.*.local.json`,
   `.claude`, `.vscode`, `.idea`. Patterns are anchored at the context root (unlike `.gitignore`), so secret-file
   patterns need `**/` to match in subdirectories (amended 2026-11-21, T-0100 review).
4. **Build in the cluster**: binary Docker-strategy `BuildConfig consolinho` (`dockerfilePath: deploy/Containerfile`)
   → `ImageStream consolinho:latest`. `scripts/deploy-dev.sh` uploads a clean archive (`--from-archive`) built from
   `git ls-files -co --exclude-standard`, so the working tree (incl. uncommitted changes) is deployed but ignored and
   generated files (node_modules, bin/obj, secrets) are never uploaded (ADR-0030).
5. **Image check** `scripts/check-image.sh` (QG-3) is the build-time assertion for IMG-2/3: no `FleetConsole.DevOAuth*`,
   `*.csproj`, `node`/`npm` or `dotnet` SDK in the final image; runs with a random UID, group 0, `--read-only`.

## Alternatives
- **Chiseled Ubuntu .NET images**: smaller, but non-Red-Hat registry pulls and the non-root UID model (`app`, 1654)
  needs extra care under `restricted-v2`; UBI is the familiar, supported OpenShift baseline. Revisit if image size
  matters.
- **Self-contained/trimmed publish**: trimming is risky with EF Core and reflection-heavy libraries; no gain worth it.

## Consequences
- amd64 only (out of scope: multi-arch). The in-cluster build needs egress to the npm registry and nuget.org; a
  failing pull is a runbook troubleshooting item (OPS-3).
- ADR-0006 stays valid; this ADR adds the "how".
