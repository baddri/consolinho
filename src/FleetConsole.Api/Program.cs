using FleetConsole.Api.Http;
using FleetConsole.Application;
using OpenTelemetry.Trace;

// Composition root for the FleetConsole backend: wires Aspire service defaults (telemetry, health, resilience), the
// Application layer (CQRS dispatcher + pipeline behaviors), ProblemDetails error handling, and hosts the HTTP surface.
// Feature endpoint groups (admin API, auth, Kubernetes proxy) are mapped under /api by later tasks.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddApiProblemDetails();
builder.Services.AddApplication();

// Export the per-request spans created by the Application layer's LoggingBehavior alongside ASP.NET Core's.
builder.Services.AddOpenTelemetry().WithTracing(tracing => tracing.AddSource(ApplicationDiagnostics.ActivitySourceName));

var app = builder.Build();

// First in the pipeline so exceptions from everything after it become ProblemDetails (GlobalExceptionHandler).
app.UseExceptionHandler();

app.MapDefaultEndpoints();

// Root of the console's own REST API. Endpoint groups (e.g. /api/admin, /api/auth) are added to this group so shared
// filters (CSRF header check, ProblemDetails, auth) can be applied in one place.
app.MapGroup("/api");

await app.RunAsync().ConfigureAwait(false);
