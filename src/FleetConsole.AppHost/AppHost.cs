// Aspire orchestration for local development (`aspire run`). Starts a Postgres container (via podman, see CLAUDE.md),
// the DevOAuth emulator standing in for the host cluster's OpenShift OAuth server, the Api project with the database
// connection string injected as ConnectionStrings__consoledb, and the Vite dev server for web/ with the Api's
// endpoints injected for its /api proxy (and the Vite URL injected into the Api as its public origin).
var builder = DistributedApplication.CreateBuilder(args);

// Data volume keeps the database across `aspire run` restarts. pgAdmin is intentionally not added; append
// `.WithPgAdmin()` locally if you want it.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();

var consoleDb = postgres.AddDatabase("consoledb");

// Development-only emulator of the OpenShift OAuth server + users/~ (ADR-0007, ADR-0010); never deployed. Always its
// "http" launch profile (fixed port http://localhost:5190), whichever profile the AppHost runs with, so the login URL
// is stable. The health check makes the dashboard show it healthy and lets the Api wait for it.
// Projects are added by path (relative to the AppHost directory); Aspire builds them before starting them.
var devOAuth = builder.AddDotnetProject(
        "devoauth",
        "../FleetConsole.DevOAuth/FleetConsole.DevOAuth.csproj",
        options => options.LaunchProfileName = "http")
    .WithHttpHealthCheck("/health");

// The resource name "api" is a contract: WithReference(api) below exposes it to the web app as
// services__api__http__0 / services__api__https__0, which web/vite.config.ts reads as its /api proxy target.
// Auth__OpenShift__HostApiServerUrl points the Api's OpenShift login at the emulator; the client id/secret and admin
// group come from the Api's appsettings.Development.json (contract §11).
var api = builder.AddDotnetProject("api", "../FleetConsole.Api/FleetConsole.Api.csproj")
    .WithReference(consoleDb)
    .WaitFor(consoleDb)
    .WithEnvironment("Auth__OpenShift__HostApiServerUrl", devOAuth.GetEndpoint("http"))
    .WaitFor(devOAuth);

// Runs `npm run dev` in web/. AddViteApp uses npm and adds an installer step that runs `npm install` before the dev
// server starts, so a fresh clone works without a manual install. Vite gets its port from Aspire.
var web = builder.AddViteApp("web", "../../web")
    .WithReference(api)
    .WaitFor(api);

// The browser uses the Vite URL, and Vite proxies /api with changeOrigin, so the Api can't see that origin: tell it
// (Console:PublicOrigin, ADR-0010). The OAuth redirect_uri is built from it, so the callback reaches the Api through
// Vite and the session cookie is set on the origin the SPA runs on. This makes web and api reference each other's
// endpoints; Aspire allocates endpoints before resolving environment values, so that is not a startup cycle (only
// web waits for api).
api.WithEnvironment("Console__PublicOrigin", web.GetEndpoint("http"));

await builder.Build().RunAsync().ConfigureAwait(false);
