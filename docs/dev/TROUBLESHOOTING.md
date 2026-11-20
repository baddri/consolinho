# Troubleshooting the local dev workflow

Problems actually hit while setting up and running FleetConsole locally (Fedora, rootless podman 5, Aspire CLI 13.6, since T-0063 Aspire CLI 17.0),
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

## "A new version of Aspire is available" / the AppHost won't start after pulling T-0063

The repo is on Aspire 17.0.0 (ADR-0025) and needs the **matching CLI**. Install/repin it with
`curl -sSL https://aspire.dev/install.sh | bash -s -- --version 17.0.0` (add `--skip-path` if `~/.aspire/bin` is
already on PATH), then check `aspire --version`. A 13.x CLI can't run the AppHost. **Don't run `aspire update`** for
a newer version without a task: it rewrites the repo's Aspire package references. All `Aspire.Hosting.*` versions in
`Directory.Packages.props` stay in step; `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` is deliberately on 13.6.5
until a stable 17.x exists. Build error ASPIRE013 means `AspireUseCliBundle` was removed/false in the AppHost csproj.

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

## `CS0433: The type 'Program' exists in both 'FleetConsole.Api' and 'FleetConsole.DevOAuth'` (T-0009)

**Cause:** since .NET 10 the ASP.NET Core source generator makes a top-level `Program` **public** automatically. The
Api test project references both web apps, so `WebApplicationFactory<Program>` became ambiguous.
**Fix (in place):** `src/FleetConsole.DevOAuth/Program.cs` declares `internal partial class Program;`, which the
generator respects. DevOAuth tests use `WebApplicationFactory<DevOAuthEntryPoint>`. Any new web project referenced by a
test project needs the same treatment, and must not grant `InternalsVisibleTo` to a test project that also uses the
Api's `Program`.

## `devoauth` fails to start: address already in use on port 5190

The emulator always uses http://localhost:5190 (its `http` launch profile, also under the https AppHost profile).
**Cause:** an earlier `aspire run` or `dotnet run --project src/FleetConsole.DevOAuth` is still running.
**Fix:** `aspire stop`, or find it with `pgrep -af FleetConsole.DevOAuth` and stop it. Running the emulator on its own
(`dotnet run --project src/FleetConsole.DevOAuth`) works too; it only starts in the Development environment.
