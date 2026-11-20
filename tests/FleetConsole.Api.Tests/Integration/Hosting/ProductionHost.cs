using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// A Production-environment Api host derived from the shared <see cref="ApiFactory"/> (ADR-0028 consequences), with a
/// temporary web root holding a minimal built SPA: <see cref="IndexHtml"/> as <c>index.html</c> and
/// <see cref="AssetPath"/>. Going through <see cref="ApiFactory"/> gives it the same database, captured logs
/// (<see cref="ApiFactory.Logs"/>) and Production settings (<see cref="TestHostConfiguration.Offline"/>, and whatever
/// later tasks add there). Dispose it in the test (<c>await using</c>); that also deletes the web root.
/// </summary>
/// <remarks>Reused by the production-hardening tests (config validation, security headers).</remarks>
public sealed class ProductionHost : IAsyncDisposable
{
    /// <summary>The body of the fake built <c>index.html</c>.</summary>
    public const string IndexHtml = "<!doctype html><html><body><div id=\"root\"></div></body></html>";

    /// <summary>A Vite-style content-hashed asset present in the web root.</summary>
    public const string AssetPath = "/assets/app-3f2a1b.js";

    private readonly string _webRoot;

    private ProductionHost(WebApplicationFactory<Program> factory, string webRoot)
    {
        Factory = factory;
        _webRoot = webRoot;
    }

    /// <summary>The derived host; use it for clients and services.</summary>
    public WebApplicationFactory<Program> Factory { get; }

    /// <summary>The services of the running Production host (starts it on first use).</summary>
    public IServiceProvider Services => Factory.Services;

    /// <summary>Creates a Production host.</summary>
    /// <param name="factory">The shared Development factory to derive from.</param>
    /// <param name="settings">Extra configuration (e.g. a connection string or logging levels), applied last.</param>
    /// <returns>The host; dispose it.</returns>
    public static ProductionHost Create(ApiFactory factory, IReadOnlyDictionary<string, string?>? settings = null)
    {
        var webRoot = Path.Combine(Path.GetTempPath(), "fleetconsole-webroot-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(webRoot, "assets"));
        File.WriteAllText(Path.Combine(webRoot, "index.html"), IndexHtml);
        File.WriteAllText(Path.Combine(webRoot, AssetPath.TrimStart('/')), "console.log('app');");

        var derived = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Production);
            builder.UseSetting(WebHostDefaults.WebRootKey, webRoot);
            foreach (var (key, value) in settings ?? new Dictionary<string, string?>())
            {
                builder.UseSetting(key, value);
            }
        });
        return new ProductionHost(derived, webRoot);
    }

    /// <summary>A client without the CSRF header that does not follow redirects.</summary>
    /// <returns>The client.</returns>
    public HttpClient CreateClient() =>
        Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        try
        {
            Directory.Delete(_webRoot, recursive: true);
        }
        catch (IOException)
        {
            // Best effort: a leftover temp directory must not fail the test.
        }
    }
}
