using FleetConsole.Api.Endpoints;
using FleetConsole.Api.Hosting;
using FleetConsole.Api.Http;
using FleetConsole.Api.OpenApi;
using FleetConsole.Application;
using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure;
using OpenTelemetry.Trace;

// Composition root for the FleetConsole backend: wires Aspire service defaults (telemetry, health, resilience), the
// Application layer (CQRS dispatcher + pipeline behaviors), Infrastructure (PostgreSQL via EF Core), ProblemDetails
// error handling and OpenAPI, and maps the HTTP surface (/api endpoint groups).
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInfrastructure();

builder.Services.AddApiJson();
builder.Services.AddApiProblemDetails();
builder.Services.AddApiOpenApi();
builder.Services.AddApplication();
builder.Services.AddSingleton<IAppEnvironment, HostAppEnvironment>();

// Export the per-request spans created by the Application layer's LoggingBehavior alongside ASP.NET Core's.
builder.Services.AddOpenTelemetry().WithTracing(tracing => tracing.AddSource(ApplicationDiagnostics.ActivitySourceName));

var app = builder.Build();

// First in the pipeline so exceptions from everything after it become ProblemDetails (GlobalExceptionHandler).
app.UseExceptionHandler();

// Bodiless error responses (e.g. 404 for an unknown /api route, 405) get a ProblemDetails body through the
// ProblemDetails service registered by AddApiProblemDetails, so clients only ever parse one error format.
app.UseStatusCodePages();

app.MapDefaultEndpoints();

// The OpenAPI document (/openapi/v1.json) feeds the SPA's type generation during development. Like the health
// endpoints it is not exposed outside Development for now; revisit with the deployment work (CP3).
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapApiEndpoints();

await app.RunAsync().ConfigureAwait(false);

/// <summary>
/// The Api's entry point type, made visible so integration tests can host the real application with
/// <c>WebApplicationFactory&lt;Program&gt;</c>.
/// </summary>
public partial class Program;
