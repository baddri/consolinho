# 0027 — Schema migrations: the Api image's `migrate` mode as an init container
**Status:** Accepted (2026-11-21) · CP3 spec DB-1, DB-2, Q3

## Context
Outside Development the Api never migrates at startup (BACKEND.md "Persistence"). Production needs an explicit,
idempotent step that runs before a new version serves traffic, blocks the rollout on failure and uses the same image.

## Decision
1. **Migrate mode**: `dotnet FleetConsole.Api.dll migrate` (image args `["migrate"]`) applies pending EF Core
   migrations and exits — `0` on success (also when nothing was pending), `1` on failure after logging one Critical
   line with the exception (message only; the connection string is never logged). Kestrel is not started and no
   hosted service runs.
2. **Only `ConnectionStrings:consoledb` is required** in migrate mode (plus `ASPNETCORE_ENVIRONMENT`). Program checks
   for the argument right after `builder.Build()`, before the host starts, so `ValidateOnStart` checks (OAuth, public
   origin, DP certificate) never run in this mode, and no registration step may eagerly load files that are only
   mounted into the main container.
3. **One migrator**: the migration logic lives in `Infrastructure/Persistence` (e.g. `DatabaseMigrator.MigrateAsync
   (IServiceProvider, CancellationToken)` returning the applied migration names) and is shared by migrate mode and
   `DevelopmentDatabaseMigrator`. It logs the applied migration names at Information.
4. **Init container** `migrate` in the `consolinho` Deployment, same image, env: only the DB Secret and the
   environment. Every pod start runs it; `DatabaseMigrator` holds a session-level Postgres advisory lock (unpooled
   connection) from reading the pending list until migration ends, so concurrent pods are serialised and a later run
   finds nothing pending. *Amended in T-0099:* EF Core 9+'s own migration lock (Npgsql: a table lock released per
   migration transaction) was assumed to suffice but let two concurrent runs both apply a migration (42P07).
5. **Forward-only**: no down-migrations are run. Rolling back the image is allowed only if the old version works on
   the new schema; otherwise restore the database backup (runbook).

## Alternatives
- **Job**: immutable `spec.template` makes re-applying with a new image fail under plain `oc apply`/kustomize, and the
  Deployment doesn't wait for the Job. Needs hooks (Helm/Argo) we don't have.
- **Migrate on startup in Production**: couples readiness with DDL and hides failures as crash loops of serving pods.

## Consequences
- A failed migration leaves the new pod in `Init:Error`/`Init:CrashLoopBackOff`; with `maxUnavailable: 0` the old pods
  keep serving and `oc logs <pod> -c migrate` shows the error (DB-2).
- Every pod start opens one extra short DB connection; negligible.
