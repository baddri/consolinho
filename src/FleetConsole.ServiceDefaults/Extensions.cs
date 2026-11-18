using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

// Deliberately in the Microsoft.Extensions.Hosting namespace (Aspire template convention) so AddServiceDefaults /
// MapDefaultEndpoints are available in Program.cs without an extra using directive.
namespace Microsoft.Extensions.Hosting;

/// <summary>
/// Aspire service defaults shared by every FleetConsole service project: OpenTelemetry (logs, metrics, traces),
/// health checks, service discovery and standard HTTP resilience. Adapted from the Aspire 13 <c>aspire-servicedefaults</c>
/// template; see https://aka.ms/aspire/service-defaults.
/// </summary>
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    /// <summary>
    /// Registers the full set of service defaults. Call once, early, on the host builder of each service.
    /// </summary>
    /// <remarks>
    /// The resilience handler applies to every <see cref="System.Net.Http.HttpClient"/> created through
    /// <c>IHttpClientFactory</c>. The Kubernetes proxy forwards with YARP's own <c>HttpMessageInvoker</c> (not the
    /// factory), so long-lived watch/exec streams are not subject to these retry/timeout policies.
    /// </remarks>
    /// <typeparam name="TBuilder">The host application builder type.</typeparam>
    /// <param name="builder">The host builder to configure.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // Turn on resilience by default
            http.AddStandardResilienceHandler();

            // Turn on service discovery by default
            http.AddServiceDiscovery();
        });

        return builder;
    }

    /// <summary>
    /// Configures OpenTelemetry logging, metrics (ASP.NET Core, HttpClient, runtime) and tracing. Health probe requests
    /// are excluded from traces to keep the dashboard readable.
    /// </summary>
    /// <typeparam name="TBuilder">The host application builder type.</typeparam>
    /// <param name="builder">The host builder to configure.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                    .AddAspNetCoreInstrumentation(tracing =>
                        // Exclude health check requests from tracing
                        tracing.Filter = context =>
                            !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                            && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath)
                    )
                    .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    /// <summary>
    /// Enables the OTLP exporter only when an endpoint is configured (Aspire sets <c>OTEL_EXPORTER_OTLP_ENDPOINT</c>
    /// for the dashboard; production sets it to the cluster's collector).
    /// </summary>
    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    /// <summary>
    /// Registers the baseline health checks: a <c>self</c> check tagged <c>live</c> used by the liveness endpoint.
    /// Later tasks add readiness checks (e.g. the database) without the <c>live</c> tag.
    /// </summary>
    /// <typeparam name="TBuilder">The host application builder type.</typeparam>
    /// <param name="builder">The host builder to configure.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            // Add a default liveness check to ensure app is responsive
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    /// <summary>
    /// Maps <c>/health</c> (all checks, readiness) and <c>/alive</c> (checks tagged <c>live</c>, liveness).
    /// </summary>
    /// <remarks>
    /// Mapped in Development only, as the Aspire template recommends: health endpoints can leak information.
    /// Production liveness/readiness probes for OpenShift are part of the deployment checkpoint (docs/plan/ROADMAP.md, CP3).
    /// </remarks>
    /// <param name="app">The web application to map endpoints on.</param>
    /// <returns>The same application, for chaining.</returns>
    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            // All health checks must pass for app to be considered ready to accept traffic after starting
            app.MapHealthChecks(HealthEndpointPath);

            // Only health checks tagged with the "live" tag must pass for app to be considered alive
            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}
