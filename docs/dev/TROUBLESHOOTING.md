# Troubleshooting the local dev workflow

Problems actually hit while setting up and running FleetConsole locally (Fedora, rootless podman 5, Aspire CLI 13.6),
with the fix. Add new entries when you hit something; keep each one short: symptom, cause, fix.

## Integration tests fail with `DockerUnavailableException`

```
DotNet.Testcontainers.Builders.DockerUnavailableException : Docker is either not running or misconfigured.
    Failed to connect to Docker endpoint at 'unix:///var/run/docker.sock'.
```

**Cause:** `DOCKER_HOST` isn't set, so Testcontainers looks for Docker's socket. There is no Docker here.
**Fix:** enable the podman socket and export the variables from the README in the shell that runs `dotnet test`:

```bash
systemctl --user enable --now podman.socket
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true
```

## `DOCKER_HOST` points to `/run/user//podman/podman.sock` (fish shell)

**Cause:** `$UID` is a bash variable; fish doesn't define it, so it expands to nothing.
**Fix:** use `$(id -u)`, which works in bash, zsh and fish (3.4+).

## Dev certificate only partially trusted; browser warns on the dashboard

`aspire run` prints `Developer certificates may not be fully trusted (trust exit code was: PartiallyFailedToTrustTheCertificate)`.
`dotnet dev-certs https --trust` only partially succeeds on Fedora (it can't update every trust store, e.g. Firefox's).
**Effect:** the app still starts and works; https URLs (dashboard on 17297, Api on 7180) show certificate warnings.
**Fix:** use the http profile: `aspire run --launch-profile http` (dashboard http://localhost:15274, Api
http://localhost:5180). The http profile sets `ASPIRE_ALLOW_UNSECURED_TRANSPORT=true` in
`src/FleetConsole.AppHost/Properties/launchSettings.json`; without it Aspire refuses to start a dashboard over plain http.

## `npm run gen:api` fails with a connection error

**Cause:** the Api isn't running at `http://localhost:5180` (the script's default, the Api's launch-profile port), or
it isn't running in Development, where `/openapi/v1.json` is mapped.
**Fix:** start the app, then `cd web && npm run gen:api` (override with `API_URL=...` if the Api is elsewhere). On
failure the existing `schema.gen.ts` is left intact.

## Can't find the web URL

The Vite dev server gets a new port from Aspire on every run (seen: 28036, 28720, 45697, 34163). Use the dashboard's
resource list or `aspire describe`. Open the **web** URL in the browser, not the Api: the Api doesn't serve the SPA yet
(single-container SPA hosting, ADR-0006, comes with the deployment work).

## Stopping a backgrounded AppHost leaves processes running

**Symptom:** you started `aspire run` or `dotnet run --project src/FleetConsole.AppHost` with `&` (or from a tool) and
Ctrl+C/`kill -INT` does nothing.
**Cause:** non-interactive background jobs ignore SIGINT.
**Fix (preferred):** run it with `aspire start --launch-profile http` and stop it with `aspire stop`. Otherwise send
SIGTERM to the `aspire` / `FleetConsole.AppHost` process (`pkill -TERM -f FleetConsole.AppHost`).
After `aspire stop` (or SIGTERM), DCP needs a few seconds to stop the Api/Vite processes and remove the Postgres
container. Check with `aspire ps`, `pgrep -af 'dcp|FleetConsole'` and `podman ps`. The Postgres **volume**
(`fleetconsole.apphost-<hash>-postgres-data`) is kept on purpose; `podman volume rm` it to start from an empty database.

## "A new version of Aspire is available: 17.0.0"

Ignore it. **Don't run `aspire update`**: it updates the Aspire package references in the repo. The stack is pinned to
Aspire 13 (ADR-0001); moving to a new major needs an ADR. The `Aspire.AppHost.Sdk/<version>` in the AppHost csproj and
the `Aspire.Hosting.*` versions in `Directory.Packages.props` must stay in step.

## Inspecting the dev database

`psql` inside the container needs the generated password, which the container has in its environment:

```bash
podman ps --format '{{.Names}}'                                   # postgres-<suffix>
podman exec <postgres-container> sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d consoledb -c "\dt"'
```

Tables and columns are snake_case, including EF's history table: `__ef_migrations_history`, not `"__EFMigrationsHistory"`.

## `dotnet test` fails after adding a test project (from T-0001, not reproduced here)

Test projects must reference `xunit.v3.mtp-off`, not `xunit.v3`; the solution runs tests through VSTest
(`dotnet test FleetConsole.slnx`). Copy an existing test csproj.
