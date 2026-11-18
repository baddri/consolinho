using FleetConsole.DevOAuth;
using FleetConsole.DevOAuth.Endpoints;

// FleetConsole.DevOAuth: emulates the subset of the OpenShift OAuth server and the host API server that the Api's
// login uses (ADR-0007, ADR-0010, docs/specs/CP1-api-contract.md §11), so local development and integration tests run
// the production login code path with only configuration changed. Development/test only; never deployed.
var builder = WebApplication.CreateBuilder(args);

// Defence in depth for "never deployed": the project is not publishable and nothing but the AppHost references it,
// but if someone runs it anyway outside Development it refuses to start instead of handing out tokens.
if (!builder.Environment.IsDevelopment())
{
    throw new InvalidOperationException(
        $"FleetConsole.DevOAuth is a development-only emulator and must not run in the '{builder.Environment.EnvironmentName}' environment.");
}

builder.AddServiceDefaults();
builder.Services.AddDevOAuth(builder.Configuration);

var app = builder.Build();

app.MapDefaultEndpoints();
app.MapDevOAuthEndpoints();

await app.RunAsync().ConfigureAwait(false);

/// <summary>
/// The emulator's entry point, declared <c>internal</c> on purpose. Since .NET 10 the ASP.NET Core source generator
/// makes a top-level <c>Program</c> public unless it is declared explicitly; the Api test project references both the
/// Api (whose public <c>Program</c> its tests use) and this project, and two public global <c>Program</c> types would
/// clash there (CS0433). Tests host the emulator through <see cref="DevOAuthEntryPoint"/> instead.
/// </summary>
internal partial class Program;
