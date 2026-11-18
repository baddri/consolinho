// Aspire orchestration for local development (`aspire run`). Starts a Postgres container (via podman, see CLAUDE.md)
// and the Api project with the database connection string injected as ConnectionStrings__consoledb.
// The Vite dev server for web/ is added in T-0004.
var builder = DistributedApplication.CreateBuilder(args);

// Data volume keeps the database across `aspire run` restarts. pgAdmin is intentionally not added; append
// `.WithPgAdmin()` locally if you want it.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();

var consoleDb = postgres.AddDatabase("consoledb");

builder.AddProject<Projects.FleetConsole_Api>("api")
    .WithReference(consoleDb)
    .WaitFor(consoleDb);

await builder.Build().RunAsync().ConfigureAwait(false);
