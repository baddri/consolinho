---
id: T-0100
title: Containerfile (UBI 9, three stages), .containerignore and the podman image check script
status: done
owner: backend-engineer
checkpoint: 3
depends_on: [T-0098, T-0099]
paths: [deploy/Containerfile, .containerignore, scripts/check-image.sh]
review_rounds: 0
---

## Goal
Build the single production image (ADR-0026) and prove locally with podman that it runs the way OpenShift will run it:
arbitrary UID in group 0, read-only root filesystem, migrate mode first, then the web host serving SPA + probes.
Spec: IMG-1..4, QG-3, plus the end-to-end checks of T-0099's exit codes (DB-1/2, HOST-6).
Authoring the Containerfile may start before the dependencies land; the check script's assertions need them.

## Scope
- In: `deploy/Containerfile`, `.containerignore` (repo root), `scripts/check-image.sh`.
- Out: manifests (T-0101), cluster builds (T-0102), CI wiring.

## Contract / design notes
- **Containerfile**: exactly ADR-0026 §1–2 (stages `web`, `build`, `runtime`; context = repo root; anonymous
  `registry.access.redhat.com` images pinned to stream tags; `npm ci`; restore layer before source copy; publish only
  `src/FleetConsole.Api`; `wwwroot` from `web/dist`; group-0 permissions; `USER 1001`; port 8080;
  `ENTRYPOINT ["dotnet", "FleetConsole.Api.dll"]`). Header comment: how to build (`podman build -f deploy/Containerfile .`),
  modes (`migrate`), writable paths (`/tmp` only). Add OCI labels (`org.opencontainers.image.title=consolinho`,
  `source`, `revision` from a `--build-arg REVISION`, default `unknown`).
- **`.containerignore`**: ADR-0026 §3 list.
- **`scripts/check-image.sh`** (`set -euo pipefail`, shellcheck-clean, token-frugal like `scripts/check-be.sh`: full log
  under `$(git rev-parse --git-path checks)/<run>/`, prints one line per step + failures). Needs `podman`, `openssl`,
  `curl`. Steps (all containers with `--user <random 100000-999999>:0 --read-only --tmpfs /tmp`):
  1. `podman build -f deploy/Containerfile -t localhost/consolinho:check .`
  2. Image content: `podman run --rm --entrypoint sh … -c` asserts no `FleetConsole.DevOAuth*`, no `*.csproj`, no
     `node`/`npm`, no `dotnet` SDK (`dotnet --list-sdks` empty), and `wwwroot/index.html` present.
  3. Throwaway network + `docker.io/library/postgres:18.3` (same image as `PostgresFixture`), fake password.
  4. Temp dir (umask 077, `trap` cleanup of dir, containers, network): self-signed DP PFX + password file, a fake CA
     PEM (openssl). Mounted read-only.
  5. `migrate` with **only** `ConnectionStrings__consoledb` + `ASPNETCORE_ENVIRONMENT=Production` → exit 0; again → 0.
  6. Web host with `ASPNETCORE_ENVIRONMENT=Production`, connection string, DP cert + password paths,
     `Console__PublicOrigin=https://consolinho.example.test`, `Auth__OpenShift__HostApiServerUrl=https://kubernetes.invalid`,
     static `AuthorizationEndpoint`/`TokenEndpoint` on `oauth.invalid`, `ClientId`, a fake `ClientSecret`,
     `CaBundlePath` = fake CA; published on `127.0.0.1:<random>`. Wait for `/alive` (≤ 60 s). Assert: `/` and
     `/c/x/k8s/ns/a/pods/b` → 200 with `<div id="root">`; `/api/nope` → 404 `application/problem+json`; `/alive`
     and `/health` → 200 `Healthy`; `index.html` `Cache-Control: no-cache`; `Content-Security-Policy` present.
  7. Same web host **without** the DP cert path → exit code **1** within 30 s and its log contains
     `Startup configuration error: DataProtection:KeyEncryptionCertificatePath` (T-0099 `ConsoleHostRunner`; a crash
     with a stack trace does not count). Also without the DP cert path **and** without `Console__PublicOrigin` → exit
     1 with one such line per key (failures of several options types arrive as an `AggregateException`).
  7b. `migrate` against an unreachable database (e.g. `Host=db.invalid`) → exit code **1** and one
     `Database migration failed:` line (T-0099 `MigrateMode`; untested in-process, factory race T-0094).
  8. No log of steps 5–7 contains the fake client secret, the DB password or the PFX password.
- Never use `docker`; never push the image.

## Context pack
- Docs: ADR-0026, ADR-0027, ADR-0028, ADR-0030 § Configuration contract (env names).
- Exemplars: `scripts/check-be.sh` (log dir, summary style); `tests/FleetConsole.Api.Tests/Integration/PostgresFixture.cs:L20`
  (Postgres image); `tests/FleetConsole.Api.Tests/Integration/TestHostConfiguration.cs:Offline` (the fake login
  settings to mirror as env vars).
- Inputs: `global.json`, `Directory.Build.props`, `Directory.Packages.props`, `.editorconfig`, the `ProjectReference`s in
  `src/FleetConsole.Api/FleetConsole.Api.csproj` (Application, Domain, Infrastructure, ServiceDefaults);
  `web/package.json` (`engines.node >=22.22`, `build` = `tsc -b && vite build`).
- Podman env: CLAUDE.md "Podman notes".

## Acceptance criteria
- [x] IMG-1/IMG-4: `podman build -f deploy/Containerfile .` succeeds from a clean clone state; chosen base image tags in
      the work log; lockfiles honoured.
- [x] IMG-2/IMG-3/QG-3: `scripts/check-image.sh` passes all steps above (paste its summary in the work log).
- [x] `shellcheck scripts/check-image.sh` clean (`podman run --rm -v "$PWD:/mnt:ro,Z" docker.io/koalaman/shellcheck:stable`
      if not installed); `bash -n` ok.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 backend-engineer: started. Registry check: `ubi9/dotnet-100{,-runtime}` and `ubi9/nodejs-22` publish
  RHEL-minor stream tags (`9.7`..`9.9`, `latest`), no `10.0` tag; ubi10 .NET 10 repos don't exist → pinned `:9.9`.
- 2026-11-21: tags `ubi9/nodejs-22:9.9` (node 22.23.4), `ubi9/dotnet-100:9.9` (SDK 10.0.115), runtime
  **`ubi9/dotnet-100-aspnet:9.9`** (ASP.NET 10.0.15) — deviation from ADR-0026: `dotnet-100-runtime` has no ASP.NET
  Core for .NET 10 ("framework not found"). Image 327 MiB. Rootless podman can't run UID ≥65536, so the script maps it
  (`--uidmap`); image files then appear unowned → access via group 0 only, like OpenShift.
- 2026-11-21: step 7 (2 failures) found a T-0099 bug: Host.StartAsync builds hosted services before the startup
  validator; DP's hosted service eagerly loads the cert options → only the DP error was logged (+ host stack trace).
  Fix outside paths (1 line, `ConsoleHostRunner`): run `IStartupValidator.Validate()` before `StartAsync`.
- 2026-11-21: check-image STEP 1–8 + 7b all ok (`IMAGE CHECK: ok`); check-deploy ok (shellcheck clean); check-be ok
  (325/684/764 passed). Extra `.containerignore` entries: `**/*.tsbuildinfo`, `deploy/kustomize/overlays/.dev-generated`.
- 2026-11-21 review round 1: `**/` prefix on the four secret patterns; step 2 also asserts no `.env*`/`*kubeconfig`/
  `appsettings.*.local.json` under `/opt/app-root` and runs a throwaway context probe (planted fakes in sub-dirs; build
  fails if any passes — verified it fails with the old bare patterns). check-image + check-deploy rerun: ok.

## Review
**2026-11-21 backend-architect — CHANGES_REQUESTED** (check-deploy ok; check-be ok 325/684/764; check-image not rerun)
- `.containerignore:9-12` — `.env*`, `*.kubeconfig`, `kubeconfig`, `appsettings.*.local.json` are anchored at the
  context root (verified with podman: `sub/.env.local`, `sub/appsettings.Dev.local.json`, `sub/x.kubeconfig` all reach
  the context), so e.g. `src/FleetConsole.Api/appsettings.Production.local.json` would be copied by `COPY src/ src/` and
  published (Web SDK content) into the runtime image — prefix all four with `**/` (ADR-0026 §3 amended accordingly).
- Optional: `scripts/check-image.sh` step 2 — also assert no `appsettings.*.local.json` / `.env*` under `/opt/app-root`.
Rulings (accepted, no change needed):
- Runtime base `ubi9/dotnet-100-aspnet:9.9` and RHEL-minor tag pinning: accepted; ADR-0026 §1 + index amended by me.
- `CMD []` + `ASPNETCORE_URLS=""`: accepted (step 6 proves the 8080 bind); recorded in ADR-0026 §1.
- `ConsoleHostRunner` validator-first: correct and side-effect free (`StartupValidator` re-reads cached
  `IOptionsMonitor` values; on failure `StartAsync` never runs). Covered only by check-image step 7 → orchestrator:
  file a follow-up BE task for an in-process test starting the host with two invalid options types.
- Rootless `--uidmap`: accepted (container UID unmapped-owner → group-0-only access mirrors OpenShift).
- Migrate ~60 s to fail on unreachable DB: acceptable for an init container (kubelet restarts with backoff); keep the
  runbook note (T-0103).
**2026-11-21 backend-architect round 2 — APPROVE** (check-deploy ok incl. shellcheck; check-image not rerun)
- `**/` prefixes fixed; step 2 asserts no local secret files under `/opt/app-root`; context probe is sound (positive
  control `keep.txt`, fails on any planted file).
- Optional: `scripts/check-image.sh:96` — with `--no-build` and a pruned runtime base, `--pull=never` fails with the
  misleading "lets planted secret files" message; could check `podman image exists "$PROBE_BASE"` first.

## Handover notes
- Base images: `registry.access.redhat.com/ubi9/{nodejs-22,dotnet-100,dotnet-100-aspnet}:9.9` (RHEL-minor stream tags;
  no `10.0` tags exist). ADR-0026 §1 names `dotnet-100-runtime`, which lacks ASP.NET Core → architect should amend it.
- `CMD []` and `ASPNETCORE_URLS=""` in the runtime stage are required: the base sets CMD `/bin/bash` (would be passed as
  an app argument) and `ASPNETCORE_URLS` (would override `ASPNETCORE_HTTP_PORTS` with a warning).
- `scripts/check-image.sh [--no-build]`: ~4–5 min with a cold build; step 7b takes ~60 s (EF retry strategy, 6 retries)
  — an init container against an unreachable DB fails after ~1 min, not immediately (runbook-worthy).
- Touched outside paths: `src/FleetConsole.Api/Hosting/ConsoleHostRunner.cs` (validator before start, see Work log).
  The in-process tests run the validator directly, so only check-image covers this ordering. Follow-up idea: an
  in-process test that starts the host with two invalid options types.
- Migrate run 1 logs an EF Error "Failed executing DbCommand … migration_history" (table absent on first run): EF noise.
