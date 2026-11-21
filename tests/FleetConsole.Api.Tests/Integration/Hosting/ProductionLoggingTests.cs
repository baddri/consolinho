using FleetConsole.Api.Hosting;
using FleetConsole.Api.Tests.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// HOST-5 / QG-2 (ADR-0028 §4, §5): outside Development request URLs (OAuth <c>code</c>/<c>state</c>) never reach the
/// logs, even when configuration turns every level, and the request-line category for specific providers, up to Trace;
/// and the console logger writes JSON.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProductionLoggingTests(ApiFactory factory)
{
    private const string FakeCode = "fake-code-123";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>
    /// Everything at Trace, plus provider-specific overrides that try to re-enable the request line for the console
    /// provider (alias) and for the test capture provider (full type name).
    /// </summary>
    private static Dictionary<string, string?> VerboseLogging() => new()
    {
        ["Logging:LogLevel:Default"] = "Trace",
        ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
        [$"Logging:Console:LogLevel:{LoggingSetup.HostingDiagnosticsCategory}"] = "Trace",
        [$"Logging:{typeof(CapturedLogs).FullName}:LogLevel:{LoggingSetup.HostingDiagnosticsCategory}"] = "Trace",
    };

    [Fact]
    public async Task OAuthCallbackUrl_NeverReachesTheLogs_EvenAtTrace()
    {
        await using var host = ProductionHost.Create(factory, VerboseLogging());
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri($"/api/auth/callback?code={FakeCode}&state=s", UriKind.Relative), Ct);

        // Positive control: the verbose configuration is in effect (other categories log at Trace), so the absence
        // below is due to the cap, not to a quiet host.
        var loggers = host.Services.GetRequiredService<ILoggerFactory>();
        loggers.CreateLogger("Microsoft.AspNetCore.Routing").IsEnabled(LogLevel.Trace).ShouldBeTrue();
        loggers.CreateLogger(LoggingSetup.HostingDiagnosticsCategory).IsEnabled(LogLevel.Information).ShouldBeFalse();
        loggers.CreateLogger(LoggingSetup.HostingDiagnosticsCategory).IsEnabled(LogLevel.Warning).ShouldBeTrue();

        factory.Logs.AllText.ShouldNotContain(FakeCode);
    }

    [Fact]
    public async Task ConsoleLogger_UsesJsonFormatter_WithUtcTimestamps_AndNoScopes()
    {
        await using var host = ProductionHost.Create(factory);

        var console = host.Services.GetRequiredService<IOptionsMonitor<ConsoleLoggerOptions>>().CurrentValue;
        var json = host.Services.GetRequiredService<IOptionsMonitor<JsonConsoleFormatterOptions>>().CurrentValue;

        console.FormatterName.ShouldBe(ConsoleFormatterNames.Json);
        json.UseUtcTimestamp.ShouldBeTrue();
        json.IncludeScopes.ShouldBeFalse();
    }
}
