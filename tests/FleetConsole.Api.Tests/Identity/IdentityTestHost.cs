using System.Collections.Concurrent;
using FleetConsole.Api.Tests.DevOAuth;
using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Identity;

/// <summary>
/// A minimal host with only <c>AddOpenShiftIdentity</c> (plus optionally ServiceDefaults), a manual <see cref="IClock"/>
/// and captured logs, so the identity adapters are tested exactly as registered, without database or Api.
/// </summary>
internal static class IdentityTestHost
{
    /// <summary>Configuration matching the shipped DevOAuth client.</summary>
    public static Dictionary<string, string?> DevConfiguration(string hostApiServerUrl = "http://localhost") => new()
    {
        ["Auth:OpenShift:HostApiServerUrl"] = hostApiServerUrl,
        ["Auth:OpenShift:ClientId"] = DevOAuthFlow.ClientId,
        ["Auth:OpenShift:ClientSecret"] = DevOAuthFlow.ClientSecret,
    };

    /// <summary>Builds (does not start) the host.</summary>
    /// <param name="configuration">Configuration values.</param>
    /// <param name="primaryHandler">Replaces the "openshift-host" primary handler (e.g. the emulator's TestServer handler).</param>
    /// <param name="environment">Host environment name.</param>
    /// <param name="withServiceDefaults">Also apply the real ServiceDefaults (resilience on every client).</param>
    /// <param name="logs">Receives every log entry.</param>
    /// <param name="clock">The clock; a fresh one when null.</param>
    public static IHost Build(
        Dictionary<string, string?> configuration,
        Func<HttpMessageHandler>? primaryHandler = null,
        string environment = "Development",
        bool withServiceDefaults = false,
        CapturedLogs? logs = null,
        ManualClock? clock = null)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            EnvironmentName = environment,
            DisableDefaults = true,
        });
        builder.Configuration.AddInMemoryCollection(configuration);
        if (logs is not null)
        {
            builder.Logging.AddProvider(logs);
            builder.Logging.SetMinimumLevel(LogLevel.Trace);
        }

        if (withServiceDefaults)
        {
            builder.AddServiceDefaults();
        }

        builder.AddOpenShiftIdentity();
        builder.Services.AddSingleton<IClock>(clock ?? new ManualClock());
        if (primaryHandler is not null)
        {
            builder.Services.AddHttpClient(OpenShiftHostHttpClient.Name).ConfigurePrimaryHttpMessageHandler(primaryHandler);
        }

        return builder.Build();
    }
}

/// <summary>An <see cref="IClock"/> that moves only when told.</summary>
internal sealed class ManualClock : IClock
{
    public DateTimeOffset UtcNow { get; private set; } = new(2026, 11, 19, 9, 0, 0, TimeSpan.Zero);

    public void Advance(TimeSpan by) => UtcNow += by;
}

/// <summary>Logger provider capturing every entry (message, structured values, exception text) of every category.</summary>
internal sealed class CapturedLogs : ILoggerProvider
{
    private readonly ConcurrentQueue<(LogLevel Level, int EventId, string Text)> _entries = new();

    public IReadOnlyList<(LogLevel Level, int EventId, string Text)> Entries => [.. _entries];

    public string AllText => string.Join('\n', _entries.Select(e => e.Text));

    public ILogger CreateLogger(string categoryName) => new Logger(categoryName, _entries);

    public void Dispose()
    {
    }

    private sealed class Logger(string category, ConcurrentQueue<(LogLevel, int, string)> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var parts = new List<string> { category, formatter(state, exception) };
            if (state is IEnumerable<KeyValuePair<string, object?>> values)
            {
                parts.AddRange(values.Select(pair => $"{pair.Key}={pair.Value}"));
            }

            if (exception is not null)
            {
                parts.Add(exception.ToString());
            }

            entries.Enqueue((logLevel, eventId.Id, string.Join(" | ", parts)));
        }
    }
}

/// <summary>
/// Primary handler stand-in: fails with a connection error while <see cref="Down"/> is true, otherwise forwards to
/// <c>inner</c> (or answers <see cref="Status"/> when there is none); counts every request.
/// </summary>
internal sealed class SwitchableHandler(Func<HttpMessageHandler>? inner = null) : DelegatingHandler
{
    private int _calls;

    public bool Down { get; set; }

    public System.Net.HttpStatusCode Status { get; set; } = System.Net.HttpStatusCode.OK;

    public int Calls => _calls;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _calls);
        if (Down)
        {
            throw new HttpRequestException("Connection refused (test)");
        }

        if (inner is null)
        {
            return Task.FromResult(new HttpResponseMessage(Status) { RequestMessage = request });
        }

        InnerHandler ??= inner();
        return base.SendAsync(request, cancellationToken);
    }
}
