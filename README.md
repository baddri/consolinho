# Consolinho (codename FleetConsole)

Consolinho is a self-hosted, OpenShift-console-like web UI for operating many (~40) OpenShift clusters from one
place. A cluster switcher in the masthead picks the active cluster; the generic resource pages (lists, details, YAML,
logs, exec) then work against that cluster. An admin area manages Consolinho users, the registered clusters, the
ServiceAccount credentials used to reach them, and which user may use which cluster in which mode (read-only or
read-write). The source code keeps the codename FleetConsole (solution, projects, namespaces).

The backend is an authenticating proxy. Users log in with the OpenShift OAuth server of the cluster FleetConsole runs
on ([ADR-0007](docs/adr/0007-openshift-oauth-login.md)); every Kubernetes API call from the SPA goes to
`/api/clusters/{cluster}/k8s/...` and is forwarded to that cluster's API server with the ServiceAccount token an admin
assigned to that user for that cluster. Tokens are stored encrypted and never returned to the browser. See
[docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) for the full picture.

> **Status:** checkpoint 1 (identity & administration) in progress. The dev OAuth emulator (`FleetConsole.DevOAuth`)
> runs as part of `aspire run`; the Api starts using it for login with T-0015. Until then the SPA shows "Not signed
> in" and the cluster switcher holds placeholder clusters.

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
aspire run                          # Postgres (podman) + DevOAuth + Api + Vite dev server; Ctrl+C stops everything
```

The CLI prints the dashboard URL with a one-time login token, e.g.
`Dashboard: https://localhost:17297/login?t=...`. Open it to see resources, logs, traces and the URLs of each service.

| What | URL |
|---|---|
| Aspire dashboard | https://localhost:17297 (http profile: http://localhost:15274); always use the printed login link |
| Web (Vite dev server, use this in the browser) | port assigned per run; shown in the dashboard and by `aspire describe` |
| Api | http://localhost:5180 (https://localhost:7180 with the default https profile) |
| Api health (Development only) | http://localhost:5180/health and `/alive` |
| DevOAuth emulator (stands in for the host cluster's OAuth server) | http://localhost:5190 (same port with either AppHost profile) |
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

## Logging in locally (DevOAuth)

In production FleetConsole logs users in with the OpenShift OAuth server of the cluster it runs on
([ADR-0007](docs/adr/0007-openshift-oauth-login.md)). Locally, `aspire run` starts **`FleetConsole.DevOAuth`**, a small
emulator of exactly the endpoints the Api uses (`/.well-known/oauth-authorization-server`, `/oauth/authorize`,
`/oauth/token`, `/apis/user.openshift.io/v1/users/~`), and points the Api at it
(`Auth__OpenShift__HostApiServerUrl=http://localhost:5190`). The Api runs the same login code as in production; only
that URL and the client credentials differ ([ADR-0010](docs/adr/0010-openshift-oauth-handler-and-devoauth-emulator.md),
contract in [docs/specs/CP1-api-contract.md §11](docs/specs/CP1-api-contract.md)).

To log in: open the **web** URL, click **Log in**, and the browser lands on the emulator's page *"FleetConsole DevOAuth
— pick a user"*. Click a user to sign in as them, or **Cancel** to test the cancelled-login path. There is no password.
The emulator redirects back to `<web URL>/api/auth/callback`: the AppHost injects the Vite URL into the Api as
`Console__PublicOrigin`, the base of the OAuth `redirect_uri` (the Api can't see that origin behind Vite's proxy). The
session cookie `FleetConsole.Session` is then set on the web URL; `GET /api/auth/me` shows who you are.

Running the Api alone (`dotnet run --project src/FleetConsole.Api`) uses `appsettings.Development.json` instead: public
origin `http://localhost:5180`, emulator at `http://localhost:5190` (start `src/FleetConsole.DevOAuth` too), client
`fleetconsole-dev`, admin group `fleetconsole-admins`. Outside Development, `Console:PublicOrigin` and
`Auth:OpenShift:*` are required and must be `https` ([contract §12](docs/specs/CP1-api-contract.md)).

A quick check without a browser (replace `<web>` with the web URL from `aspire describe`):

```bash
curl -s -o /dev/null -w '%{redirect_url}\n' -c jar -b jar '<web>/api/auth/login?returnUrl=%2F'   # → emulator authorize URL
# POST that URL's query parameters plus username=admin to http://localhost:5190/oauth/authorize, then GET the
# returned callback URL with the same cookie jar; afterwards:
curl -s -b jar '<web>/api/auth/me'                                                                   # → {"username":"admin",...}
```

| User | Full name | OpenShift groups | Typical use |
|---|---|---|---|
| `admin` | Fleet Admin | `fleetconsole-admins` | FleetConsole admin (the Api's dev config maps that group to the admin role) |
| `alice` | Alice Example | `sre` | regular user |
| `bob` | (none) | (none) | user with no full name and no groups |
| `ines` | Ines Auditor | `auditors` | an admin can make her a read-only admin (auditor demo) |

Like a real cluster, `users/~` also reports the virtual groups `system:authenticated` and `system:authenticated:oauth`
for every user. Users and the OAuth client (`fleetconsole-dev` / `dev-only-not-a-secret`, an obviously fake value)
live in `src/FleetConsole.DevOAuth/appsettings.json`; edit that file to add users. Codes and tokens are kept in memory,
so restarting the emulator just means logging in again.

**The emulator is never deployed.** It refuses to start outside the Development environment, is not publishable, and
an architecture test fails if any project other than the AppHost references it.

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
src/FleetConsole.AppHost/            Aspire orchestration: Postgres, DevOAuth, Api, Vite dev server
src/FleetConsole.ServiceDefaults/    OpenTelemetry, health checks, resilience defaults
src/FleetConsole.Domain/             aggregates, value objects, domain events (no framework dependencies)
src/FleetConsole.Application/        CQRS commands/queries/handlers, pipeline behaviors, ports
src/FleetConsole.Infrastructure/     EF Core (Postgres), persistence, external clients
src/FleetConsole.Api/                minimal API endpoints, ProblemDetails, OpenAPI, hosting
src/FleetConsole.DevOAuth/           dev/test-only OpenShift OAuth emulator (never deployed)
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

## Try the UI without a backend

```bash
cd web && npm run dev:mock
```

The SPA runs against the in-browser mock backend ([MSW](https://mswjs.io), the same mocks the frontend tests use,
ADR-0016); no Api, database or podman is needed. Open the URL Vite prints.

- **Persona:** you start signed in as `admin`. Switch with `?mockUser=<name>` on any URL (remembered for the browser
  tab) or at startup with `VITE_MOCK_USER=<name> npm run dev:mock`. Personas: `admin` (config admin), `carol`
  (admin), `ines` (read-only admin), `alice` (read-only on prod-eu-1, read-write on staging-eu-1), `bob` (no clusters),
  `none` (signed out).
- **Data is in memory:** changes work until the next page reload, which resets everything to the fixtures.
- **Login is simulated:** there is no OpenShift OAuth. "Log in with OpenShift" just reloads the app as the current
  persona, so "Log out" followed by "Log in" works, but you cannot pick a user on the login page.
- Mocks are dev-only: `npm run build` contains neither MSW nor `mockServiceWorker.js` (served from `web/msw/` in mock
  mode only). Regenerate the worker after an `msw` upgrade with `cd web && npx msw init msw --no-save`.
