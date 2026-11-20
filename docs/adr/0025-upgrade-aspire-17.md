# 0025 — Upgrade Aspire 13.6.5 → 17.0.0
**Status:** Accepted (2026-11-20) · **Amends:** 0001 (stack table: "Aspire 13" → "Aspire 17") · **Task:** T-0063

## Context
The human asked to move off Aspire 13.6.5. Aspire 17.0.0 (GA 2026-11-18, latest stable; sources: GitHub release
`v17.0.0`, aspire.dev "What's new in Aspire 17", diagnostics ASPIRE012/ASPIRE013) is the next release after 13.6.x.
Its minimum .NET is .NET 10, which we already use.

## Decision
1. All `Aspire.Hosting.*` packages on **17.0.0** (`Directory.Packages.props`).
2. **AppHost off the obsolete SDK** (17 makes `Aspire.AppHost.Sdk` obsolete, ASPIRE012, and `AddProject<T>`
   deprecated): the AppHost is a plain `Microsoft.NET.Sdk` project referencing `Aspire.Hosting.AppHost` +
   `Aspire.Hosting.Dotnet`; DevOAuth and Api are added **by path** with `AddDotnetProject(name, "../X/X.csproj")`
   (DevOAuth keeps `LaunchProfileName = "http"`). The AppHost no longer has `ProjectReference`s / `Projects.*` types;
   Aspire builds the projects before starting them. `AspireUseCliBundle=true` stays (required, ASPIRE013).
3. **Exception:** `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` stays on **13.6.5**. 17.0.0 ships it only as
   `17.0.0-preview.1.26567.5` (its net11.0 target depends on Npgsql EF Core 11 RCs) and we take no previews. Client
   integrations only consume the injected connection string, so a hosting/client version split is safe. Move it to
   the first stable 17.x.
4. **CLI:** native install pinned to the package version:
   `curl -sSL https://aspire.dev/install.sh | bash -s -- --version 17.0.0` (or `aspire update --self` for latest).
   No tool manifest: C# AppHosts require the CLI *bundle* (DCP + dashboard under `~/.aspire/bundle`), which the
   official guidance installs via the script; the `Aspire.Cli` dotnet tool was not verified to provide it.

## Notable changes / breaking changes handled
- ASPIRE012/CS0618 (SDK + `AddProject` obsolete) — handled by decision 2; build stays warning-free under `-warnaserror`.
- Default Postgres image 18.3 → 18.6 (minor; existing data volumes keep working).
- Not affecting us: removed RabbitMQ v6/MongoDB v2 clients, Azure AI package swaps, Helm 4 for k8s publishing,
  OTLP limit 64 MiB, empty required parameters rejected (we have none). Commands `aspire run/start/wait/describe/stop`
  are unchanged. No .NET SDK, EF Core or YARP upgrade needed. ServiceDefaults has no Aspire packages; unchanged.
- Available but not adopted: endpoint `PrimaryBrowserOrigin` could replace the manual `Console__PublicOrigin` wiring
  — a possible follow-up, not needed for the upgrade.

## Consequences / rollback
- Every developer machine needs Aspire CLI 17.0.0 (README). A 13.x CLI cannot run this AppHost.
- Rollback: revert the T-0063 commit and reinstall CLI 13.6.5 (`install.sh --version 13.6.5`).
