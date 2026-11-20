using FleetConsole.Api.Auth;
using FleetConsole.Api.Endpoints;
using FleetConsole.Api.Hosting;
using FleetConsole.Api.Http;
using FleetConsole.Api.OpenApi;
using FleetConsole.Api.Proxy;
using FleetConsole.Application;
using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Identity;
using OpenTelemetry.Trace;

// Composition root for the FleetConsole backend: wires Aspire service defaults (telemetry, health, resilience), the
// Application layer (CQRS dispatcher + pipeline behaviors), Infrastructure (PostgreSQL via EF Core), the host
// cluster's OpenShift login, session authentication and authorization, CSRF protection, ProblemDetails error handling and OpenAPI, and maps the HTTP
// surface (/api endpoint groups, health probes and, when the built SPA is in wwwroot, the SPA with its deep-link fallback).
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Outside Development: JSON console logs and the request-URL log cap (ADR-0028 §4/§5; OAuth codes never reach logs).
if (!builder.Environment.IsDevelopment())
{
    builder.AddProductionLogging();
}

builder.AddInfrastructure();

// Host-cluster identity adapters for login (users/~, OAuth discovery, the "openshift-host" client; ADR-0010). Needs
// IClock from AddInfrastructure. Makes Auth:OpenShift:* required configuration (validated on start).
builder.AddOpenShiftIdentity();
builder.AddPublicOrigin();

builder.Services.AddApiJson();
builder.Services.AddApiProblemDetails();
builder.Services.AddApiOpenApi();
builder.Services.AddSpaHosting();
builder.Services.AddApplication();
builder.Services.AddSingleton<IAppEnvironment, HostAppEnvironment>();

// Session cookie with revalidation, API-friendly 401/403, Admin policy (ADR-0009), and the OpenShift OAuth scheme that
// creates sessions (ADR-0010). The current user reaches the Application layer only through ICurrentUser, parsed from
// the session claims of the request.
builder.AddApiAuthentication();
builder.AddOpenShiftLogin();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();

// Kubernetes proxy (ADR-0019/0020): YARP's IHttpForwarder and the validated Proxy:* settings.
builder.AddKubernetesProxy();

// Export the per-request spans created by the Application layer's LoggingBehavior alongside ASP.NET Core's.
builder.Services.AddOpenTelemetry().WithTracing(tracing => tracing.AddSource(ApplicationDiagnostics.ActivitySourceName));

var app = builder.Build();

// First in the pipeline so exceptions from everything after it become ProblemDetails (GlobalExceptionHandler).
app.UseExceptionHandler();

// ADR-0029 security headers (CSP, nosniff, …) on every response, set when the response starts so error, static-file
// and proxied Kubernetes responses all carry them.
app.UseSecurityHeaders();

// Bodiless error responses (e.g. 404 for an unknown /api route, 405) get a ProblemDetails body through the
// ProblemDetails service registered by AddApiProblemDetails, so clients only ever parse one error format.
app.UseStatusCodePages();

// CSRF header check (ADR-0012) before authentication and before any endpoint runs, so a missing header is always a
// 403 — also for anonymous endpoints, unknown routes and malformed bodies.
app.UseCsrfHeaderCheck();

// The built SPA (ADR-0028 §1): public files, served before authentication. Inert when wwwroot is absent (aspire run).
app.UseSpaStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

// /health (readiness) and /alive (liveness) in every environment, anonymous and outside /api (ADR-0028 §2).
app.MapDefaultEndpoints();

// The OpenAPI document (/openapi/v1.json) feeds the SPA's type generation during development only; it is not exposed
// in Production (decided for CP3: the deployed console has no consumer for it).
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapApiEndpoints();

// Deep links (/c/{cluster}/...) answer with index.html; never /api, never paths with a file extension.
app.MapSpaFallback();

await app.RunAsync().ConfigureAwait(false);

/// <summary>
/// The Api's entry point type, made visible so integration tests can host the real application with
/// <c>WebApplicationFactory&lt;Program&gt;</c>.
/// </summary>
public partial class Program;
