---
id: T-0100
title: Containerfile (UBI 9, three stages), .containerignore and the podman image check script
status: todo
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
  7. Same web host **without** the DP cert path → exits non-zero within 30 s and its log contains
     `DataProtection:KeyEncryptionCertificatePath`.
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
- [ ] IMG-1/IMG-4: `podman build -f deploy/Containerfile .` succeeds from a clean clone state; chosen base image tags in
      the work log; lockfiles honoured.
- [ ] IMG-2/IMG-3/QG-3: `scripts/check-image.sh` passes all steps above (paste its summary in the work log).
- [ ] `shellcheck scripts/check-image.sh` clean (`podman run --rm -v "$PWD:/mnt:ro,Z" docker.io/koalaman/shellcheck:stable`
      if not installed); `bash -n` ok.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
