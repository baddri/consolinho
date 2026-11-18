// Aspire orchestration for local development (`aspire run`). Starts a Postgres container (via podman, see CLAUDE.md),
// the Api project with the database connection string injected as ConnectionStrings__consoledb, and the Vite dev
// server for web/ with the Api's endpoints injected for its /api proxy.
var builder = DistributedApplication.CreateBuilder(args);

// Data volume keeps the database across `aspire run` restarts. pgAdmin is intentionally not added; append
// `.WithPgAdmin()` locally if you want it.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();

var consoleDb = postgres.AddDatabase("consoledb");

// The resource name "api" is a contract: WithReference(api) below exposes it to the web app as
// services__api__http__0 / services__api__https__0, which web/vite.config.ts reads as its /api proxy target.
var api = builder.AddProject<Projects.FleetConsole_Api>("api")
    .WithReference(consoleDb)
    .WaitFor(consoleDb);

// Runs `npm run dev` in web/. AddViteApp uses npm and adds an installer step that runs `npm install` before the dev
// server starts, so a fresh clone works without a manual install. Vite gets its port from Aspire.
builder.AddViteApp("web", "../../web")
    .WithReference(api)
    .WaitFor(api);

await builder.Build().RunAsync().ConfigureAwait(false);
