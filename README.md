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
| Aspire CLI | **17.0.0** (must match the `Aspire.Hosting.*` versions) | `curl -sSL https://aspire.dev/install.sh \| bash -s -- --version 17.0.0` (installs the CLI bundle to `~/.aspire`; the C# AppHost requires the bundle, so use this script rather than the dotnet tool). Check with `aspire --version`. **Don't run `aspire update`** without a task: it rewrites the repo's Aspire package versions (ADR-0025). |
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

Fallback without the `aspire` command: `dotnet run --project src/FleetConsole.AppHost --launch-profile http` (since
Aspire 17 this still needs the installed CLI bundle in `~/.aspire`, ADR-0025; not re-verified in T-0063; stop it with
Ctrl+C, or SIGTERM when backgrounded; see [docs/dev/TROUBLESHOOTING.md](docs/dev/TROUBLESHOOTING.md)).

Quick check that it works:

```bash
curl http://localhost:5180/health                      # Healthy
curl http://localhost:<web-port>/api/system/info       # {"version":"1.0.0+<sha>","environment":"Development"} via the Vite proxy
```

## Local Kubernetes cluster (kind)

A vanilla Kubernetes cluster to develop and smoke-test the **Kubernetes** distribution against (CP5.5, T-0377). It is a
separate script, not part of `aspire run`: the single kind node costs **~1.5 GB RAM**, so start it only when you need it
and `down` it afterwards.

Prerequisites: rootless podman (above) and [kind](https://kind.sigs.k8s.io/) **v0.33.0** on your `PATH`
(e.g. `~/.local/bin/kind`). No host `kubectl` is needed: the script runs kubectl inside the kind node and never reads or
changes `~/.kube/config` or your current `oc` context.

```bash
scripts/kind-dev.sh up       # create cluster fleetconsole-dev (node image kindest/node:v1.37.0@sha256:a1ed56cf…) + seed; re-runs are no-ops
scripts/kind-dev.sh status   # present? node Ready? API URL, pods in team-a
scripts/kind-dev.sh tokens   # API URL, CA PEM and fresh tokens for fleet-viewer and team-a-editor (stdout only)
scripts/kind-dev.sh down     # delete the cluster and free the RAM
```

The seed (`deploy/kind/seed/`) creates namespaces `team-a`, `team-b`, `fleet-system`; in `team-a` a Deployment, Service,
Ingress, StatefulSet with a PVC, CronJob, ConfigMap, Secret and a `crashloop` Pod (Warning events). ServiceAccounts in
`fleet-system`: **`fleet-viewer`** (cluster-wide `view` + list namespaces) and **`team-a-editor`** (`edit` in `team-a`
only — it gets 403 on `list namespaces`, which exercises the namespace fallback).

Register it in FleetConsole:
1. **Admin › Clusters › Add**: Distribution **Kubernetes**, API URL from `tokens` (`https://127.0.0.1:16443`),
   TLS **CA bundle** = the printed PEM.
2. Add two credentials with the two printed tokens. Run the connection test for `team-a-editor` with *inspect
   namespaces* `team-a` and save them; they become that credential's `fallbackNamespaces`.
3. Grant the cluster (with one of the credentials) to a user, then pick it in the cluster switcher.

Tokens expire after `KIND_TOKEN_DURATION` (default `24h`, e.g. `KIND_TOKEN_DURATION=168h scripts/kind-dev.sh tokens`);
rotate by running `tokens` again and updating the credential. The API port changes when the cluster is recreated.
After a host reboot the node container is stopped but the cluster still exists. `status`/`tokens` then say so, and `up`
starts the node again; seed, tokens and the API URL survive. The API port is fixed at **16443** (override with
`KIND_API_PORT=<port> scripts/kind-dev.sh up` when creating; `up` fails with a clear message if the port is taken).

Re-record the discovery fixtures the SPA tests use (`web/src/mocks/k8s/fixtures/kind/`) after bumping the node image:

```bash
for p in api apis; do podman exec fleetconsole-dev-control-plane kubectl --kubeconfig /etc/kubernetes/admin.conf get --raw "/$p" | python3 -m json.tool --indent 2 > "web/src/mocks/k8s/fixtures/kind/$p.json"; done
```

If `kind create` fails with cgroup errors, see `docs/dev/TROUBLESHOOTING.md`.

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
| `e2e-user` | E2E User | (none) | reserved for the Playwright smoke: kept grantless (no-clusters landing) |
| `e2e-admin` | E2E Admin | `fleetconsole-admins` | reserved for the Playwright smoke: grantless admin |

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

### End-to-end smoke (Playwright)

A Chromium smoke (`web/e2e/`) logs in through DevOAuth and checks deep-link login, logout, the switcher labels, the
no-clusters landing and Pods browsing through the real proxy. It runs against a started stack:

```bash
cd web && npx playwright install chromium          # once; downloads into ~/.cache/ms-playwright; needs openssl on PATH
aspire start --launch-profile http && aspire wait web
cd web && npm run e2e                               # base URL from `aspire describe web`, or set E2E_BASE_URL
aspire stop
```

Global setup seeds through the admin API as `admin`: it starts an in-process fake Kubernetes API (HTTPS, self-signed,
registered with `skipTlsVerify`), registers a `e2e-smoke-<id>` cluster with a fake token and an alice read-only grant,
and deletes it afterwards (and any `e2e-smoke-*` leftovers on the next run). The no-clusters check uses the reserved
DevOAuth users `e2e-user` and `e2e-admin`; setup revokes any grants *those two* hold and never touches other users'
grants. `openssl` must be on PATH (fake API certificate). Failure traces go to `web/e2e/.results/`.

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
- [docs/ops/RUNBOOK.md](docs/ops/RUNBOOK.md): deploying to OpenShift (dev script, production overlay), upgrades, backups, troubleshooting

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
