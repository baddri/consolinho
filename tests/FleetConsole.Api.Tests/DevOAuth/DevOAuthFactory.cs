using FleetConsole.DevOAuth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.DevOAuth;

/// <summary>
/// Hosts the DevOAuth emulator in-process with its shipped <c>appsettings.json</c> (so the tests also pin the dev users
/// and client) and a <see cref="ManualTimeProvider"/> for expiry tests. No database or container needed.
/// </summary>
public sealed class DevOAuthFactory : WebApplicationFactory<DevOAuthEntryPoint>
{
    /// <summary>The emulator's clock; advance it to expire codes and tokens.</summary>
    public ManualTimeProvider Time { get; } = new();

    /// <summary>A client that does not follow redirects, so tests can read the redirect back to the OAuth client.</summary>
    /// <returns>An <see cref="HttpClient"/> for the in-process emulator (base address <c>http://localhost</c>).</returns>
    public HttpClient CreateNonRedirectingClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(Time));
    }
}

/// <summary>A <see cref="TimeProvider"/> that only moves when the test says so.</summary>
public sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset _now = new(2026, 11, 18, 9, 0, 0, TimeSpan.Zero);

    /// <inheritdoc />
    public override DateTimeOffset GetUtcNow() => _now;

    /// <summary>Moves the clock forward.</summary>
    /// <param name="by">How far.</param>
    public void Advance(TimeSpan by) => _now += by;
}
