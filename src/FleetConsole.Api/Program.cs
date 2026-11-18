// Composition root for the FleetConsole backend: wires Aspire service defaults (telemetry, health, resilience) and
// hosts the HTTP surface. Feature endpoint groups (admin API, auth, Kubernetes proxy) are mapped under /api by later
// tasks; this skeleton only establishes the host and the route group they hang off.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

var app = builder.Build();

app.MapDefaultEndpoints();

// Root of the console's own REST API. Endpoint groups (e.g. /api/admin, /api/auth) are added to this group so shared
// filters (CSRF header check, ProblemDetails, auth) can be applied in one place.
app.MapGroup("/api");

await app.RunAsync().ConfigureAwait(false);
