# FleetConsole

FleetConsole is a self-hosted, OpenShift-console-like web UI for operating many (~40) OpenShift clusters from one
place. A cluster switcher in the masthead picks the active cluster; the generic resource pages (lists, details, YAML,
logs, exec) then work against that cluster. An admin area manages FleetConsole users, the registered clusters, the
ServiceAccount credentials used to reach them, and which user may use which cluster in which mode (read-only or
read-write).

The backend is an authenticating proxy. Users log in with the OpenShift OAuth server of the cluster FleetConsole runs
on ([ADR-0007](docs/adr/0007-openshift-oauth-login.md)); every Kubernetes API call from the SPA goes to
`/api/clusters/{cluster}/k8s/...` and is forwarded to that cluster's API server with the ServiceAccount token an admin
assigned to that user for that cluster. Tokens are stored encrypted and never returned to the browser. See
[docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) for the full picture.

> **Status:** checkpoint 0 (foundations). The app runs end-to-end locally (Postgres, Api, SPA shell) but has no
> features yet. Login and the dev OAuth emulator (`FleetConsole.DevOAuth`) are **coming in CP1**; until then the SPA
> shows "Not signed in" and the cluster switcher holds placeholder clusters.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 10.0.100 or newer 10.0.x | pinned by `global.json` (`rollForward: latestFeature`) |
| Aspire CLI | 13.x (verified with 13.6.4) | `curl -sSL https://aspire.dev/install.sh \| bash` or `dotnet tool install -g Aspire.Cli`. The CLI may announce a newer major version: **don't run `aspire update`** (it rewrites the repo's Aspire package versions; the stack is pinned to Aspire 13, see ADR-0001). |
| Node.js | 22.22 or newer (npm included) | `web/package.json` `engines` |
| podman | 5.x | there is no Docker on the dev machines; Aspire and Testcontainers use podman's Docker-compatible socket |

## One-time setup: podman socket and environment

```bash
# Enable the rootless podman API socket (survives reboots)
systemctl --user enable --now podman.socket
systemctl --user is-active podman.socket          # → active
ls -l /run/user/$(id -u)/podman/podman.sock        # → srw-rw---- ... podman.sock
```

Add these to your shell profile (`~/.bashrc`; the same `export` lines work in fish's `config.fish`):

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock   # Testcontainers talks to podman through this
export TESTCONTAINERS_RYUK_DISABLED=true                          # Ryuk (reaper) doesn't work with rootless podman
export ASPIRE_CONTAINER_RUNTIME=podman                            # Aspire starts Postgres with podman
```

`dotnet tool restore` installs the repo-local tools (`dotnet-ef`). `npm install` in `web/` is optional: `aspire run`
does it for you before starting the dev server.

## Run everything locally

From the repository root (the CLI finds `src/FleetConsole.AppHost` by itself):

```bash
aspire run                          # Postgres (podman) + Api + Vite dev server; Ctrl+C stops everything
```

The CLI prints the dashboard URL with a one-time login token, e.g.
`Dashboard: https://localhost:17297/login?t=...`. Open it to see resources, logs, traces and the URLs of each service.

| What | URL |
|---|---|
| Aspire dashboard | https://localhost:17297 (http profile: http://localhost:15274); always use the printed login link |
| Web (Vite dev server, use this in the browser) | port assigned per run; shown in the dashboard and by `aspire describe` |
| Api | http://localhost:5180 (https://localhost:7180 with the default https profile) |
| Api health (Development only) | http://localhost:5180/health and `/alive` |
| OpenAPI document (Development only) | http://localhost:5180/openapi/v1.json |
| Postgres | random host port; connection string injected into the Api as `ConnectionStrings__consoledb` |

The Vite dev server proxies `/api` to the Api, so the SPA and its API calls share one origin. The Api applies EF
migrations on startup in Development. The Postgres data volume persists across runs.

**HTTPS dev certificate.** The default (https) launch profile needs a trusted ASP.NET dev certificate; `aspire run`
tries to trust it and may report `PartiallyFailedToTrustTheCertificate` (seen on Fedora). Everything still works, but the
browser warns on the dashboard. To avoid certificates altogether use the http profile:

```bash
aspire run --launch-profile http
```

**Running in the background** (scripts, Claude sessions, a second terminal):

```bash
aspire start --launch-profile http  # returns once the AppHost is up
aspire wait web                     # blocks until the web resource is healthy
aspire describe                     # resources, state, health and URLs
aspire stop                         # stops the AppHost; Postgres container is removed (volume kept)
```

Fallback without the Aspire CLI: `dotnet run --project src/FleetConsole.AppHost --launch-profile http` (stop it with
Ctrl+C, or SIGTERM when backgrounded; see [docs/dev/TROUBLESHOOTING.md](docs/dev/TROUBLESHOOTING.md)).

Quick check that it works:

```bash
curl http://localhost:5180/health                      # Healthy
curl http://localhost:<web-port>/api/system/info       # {"version":"1.0.0+<sha>","environment":"Development"} via the Vite proxy
```

## Tests and checks

Backend (integration tests start a Postgres container through podman, so the environment variables above are required):

```bash
dotnet build FleetConsole.slnx -warnaserror
dotnet test FleetConsole.slnx
```

Frontend:

```bash
cd web
npm run lint && npm run typecheck && npm test -- --run && npm run build
```

Both sets must pass before a task goes to review (CLAUDE.md rule 4).

## Regenerating API types for the SPA

`web/src/shared/api/schema.gen.ts` is generated from the Api's OpenAPI document and committed. After changing an Api
endpoint or DTO, start the app and run:

```bash
cd web && npm run gen:api
```

The script defaults to `http://localhost:5180` (the Api's launch-profile port); override with `API_URL=...` if needed.

## Database migrations

```bash
dotnet tool restore
dotnet ef migrations add <Name> -p src/FleetConsole.Infrastructure -s src/FleetConsole.Api -o Persistence/Migrations
```

No database is needed to add a migration (a design-time factory is used).

## Repository map

```
FleetConsole.slnx                    solution; Directory.Build.props / Directory.Packages.props (central versions)
src/FleetConsole.AppHost/            Aspire orchestration: Postgres, Api, Vite dev server
src/FleetConsole.ServiceDefaults/    OpenTelemetry, health checks, resilience defaults
src/FleetConsole.Domain/             aggregates, value objects, domain events (no framework dependencies)
src/FleetConsole.Application/        CQRS commands/queries/handlers, pipeline behaviors, ports
src/FleetConsole.Infrastructure/     EF Core (Postgres), persistence, external clients
src/FleetConsole.Api/                minimal API endpoints, ProblemDetails, OpenAPI, hosting
tests/                               xUnit v3 tests: Domain, Application, Api (WebApplicationFactory + Testcontainers)
web/                                 Vite + React + TypeScript + PatternFly 6 SPA
docs/                                architecture, ADRs, roadmap, specs, tasks, process, dev guides
```

## Further reading

- [CLAUDE.md](CLAUDE.md): working agreement, stack, rules and commands (read this first if you're contributing)
- [docs/architecture/](docs/architecture/): [OVERVIEW](docs/architecture/OVERVIEW.md),
  [BACKEND](docs/architecture/BACKEND.md), [FRONTEND](docs/architecture/FRONTEND.md),
  [SECURITY](docs/architecture/SECURITY.md)
- [docs/adr/](docs/adr/README.md): architecture decision records
- [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md): checkpoints
- [docs/process/SDLC.md](docs/process/SDLC.md): how work flows (tasks, agents, reviews);
  [docs/process/HANDOVER.md](docs/process/HANDOVER.md): current state
- [docs/tasks/](docs/tasks/): one file per task
- [docs/dev/TROUBLESHOOTING.md](docs/dev/TROUBLESHOOTING.md): problems we've hit and their fixes
