using System.Net;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure.Identity;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Hosts the real Api in-process (<see cref="WebApplicationFactory{TEntryPoint}"/>) against a throwaway PostgreSQL
/// (<see cref="PostgresFixture"/>) and the DevOAuth emulator as the host cluster (<see cref="TestOAuthServer"/>), so
/// tests run the production login code path. The default instance is shared by every integration test class through
/// <see cref="ApiCollectionDefinition"/>.
/// </summary>
/// <remarks>
/// <para><b>Environment:</b> Development, like <c>aspire run</c>: migrations are applied on startup, and
/// <c>/openapi/v1.json</c> and the health endpoints are mapped. Hosts derived with <c>UseEnvironment("Production")</c>
/// get <see cref="TestHostConfiguration.Offline"/> login settings (https, static endpoints, no outbound call).</para>
/// <para><b>Variants:</b> <see cref="CreateVariantAsync"/> builds another host with configuration overrides (e.g.
/// <c>Auth:AutoProvision=false</c>, <c>Auth:RevalidationInterval=00:00:00</c>) over its own database in the same
/// container and its own emulator. Dispose variants in the test (<c>await using</c>).</para>
/// <para><b>Logging in:</b> <see cref="LoginAsAsync"/> returns a client with a session; <see cref="RunLoginAsync"/>
/// drives the flow step by step for tests of the outcomes. Take users nobody else touches from
/// <see cref="NewUsername"/>/<see cref="NewAdminUsername"/>; seed data with <see cref="Data"/>.</para>
/// <para>Tests share one database per host: tests that write data must use unique values rather than assume an empty
/// database.</para>
/// </remarks>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string DefaultDatabase = "fleetconsole_tests";

    private readonly PostgresFixture _postgres;
    private readonly bool _ownsPostgres;
    private readonly string _database;
    private readonly IReadOnlyDictionary<string, string?> _overrides;
    private readonly Action<IServiceCollection>? _configureServices;

    /// <summary>Creates the shared default host (xUnit collection fixture); it owns the container.</summary>
    public ApiFactory()
        : this(new PostgresFixture(), ownsPostgres: true, DefaultDatabase, new Dictionary<string, string?>(), clock: null, configureServices: null)
    {
    }

    private ApiFactory(
        PostgresFixture postgres,
        bool ownsPostgres,
        string database,
        IReadOnlyDictionary<string, string?> overrides,
        ManualClock? clock,
        Action<IServiceCollection>? configureServices)
    {
        _postgres = postgres;
        _ownsPostgres = ownsPostgres;
        _database = database;
        _overrides = overrides;
        _configureServices = configureServices;
        Clock = clock;
    }

    /// <summary>
    /// The base address of a variant created with <c>kestrel: true</c> (real sockets, e.g. <c>http://127.0.0.1:51234/</c>);
    /// null for TestServer hosts, whose clients come from <see cref="WebApplicationFactory{TEntryPoint}.Server"/>.
    /// </summary>
    internal Uri? KestrelAddress { get; private set; }

    /// <summary>The host's <c>IClock</c> when the variant was created with a manual one; otherwise null (system clock).</summary>
    internal ManualClock? Clock { get; }

    /// <summary>Connection string of this host's database (for tests that inspect the database directly).</summary>
    public string ConnectionString => _postgres.ConnectionStringFor(_database);

    /// <summary>The container, for tests that need further databases on the same server.</summary>
    public PostgresFixture Postgres => _postgres;

    /// <summary>The emulated host cluster (OAuth server + <c>users/~</c>).</summary>
    public TestOAuthServer OAuthServer { get; } = new();

    /// <summary>Switches and observations on the traffic between the Api and the emulated host cluster.</summary>
    public OpenShiftHostStub HostStub { get; } = new();

    /// <summary>Every log entry the Api writes (Debug and above), for secret-leak assertions.</summary>
    internal CapturedLogs Logs { get; } = new();

    /// <summary>Seeds users, clusters, credentials and grants below HTTP.</summary>
    public TestData Data => new(this);

    /// <summary>Starts the container (default host only) and the emulator; xUnit calls this before the first test.</summary>
    /// <returns>A task that completes when the database accepts connections.</returns>
    public async ValueTask InitializeAsync()
    {
        if (_ownsPostgres)
        {
            await _postgres.StartAsync(TestContext.Current.CancellationToken);
        }

        // Start the emulator before the Api's warm-up can reach it from a background thread.
        _ = OAuthServer.Server;
    }

    /// <summary>
    /// Builds another Api host over its own database in the same container, with <paramref name="overrides"/> applied
    /// on top of the default test configuration.
    /// </summary>
    /// <param name="overrides">Configuration values (e.g. <c>["Auth:AutoProvision"] = "false"</c>).</param>
    /// <param name="configureHost">Sets <see cref="HostStub"/> switches before the host starts (e.g. host down).</param>
    /// <param name="clock">Replaces the Api's <c>IClock</c> (e.g. to pass the OAuth discovery retry window).</param>
    /// <param name="configureServices">Extra test service registrations, applied last (e.g. a failing decorator).</param>
    /// <param name="kestrel">Host on real Kestrel (loopback, random port, see <see cref="KestrelAddress"/>) instead of
    /// TestServer — for behaviour TestServer doesn't have (request body size feature, real upgrades, socket aborts).
    /// <see cref="WebApplicationFactory{TEntryPoint}.Server"/> is unavailable then; use <see cref="CreateKestrelBrowserClient"/>.</param>
    /// <returns>The started variant; the caller disposes it.</returns>
    internal async Task<ApiFactory> CreateVariantAsync(
        IReadOnlyDictionary<string, string?> overrides,
        Action<OpenShiftHostStub>? configureHost = null,
        ManualClock? clock = null,
        Action<IServiceCollection>? configureServices = null,
        bool kestrel = false)
    {
        var variant = new ApiFactory(_postgres, ownsPostgres: false, $"fleetconsole_v_{Guid.NewGuid():N}", overrides, clock, configureServices);
        configureHost?.Invoke(variant.HostStub);
        await variant.InitializeAsync();
        if (kestrel)
        {
            variant.UseKestrel(options => options.Listen(IPAddress.Loopback, 0));
            variant.StartServer();
            var address = variant.Services.GetRequiredService<IServer>().Features.GetRequiredFeature<IServerAddressesFeature>().Addresses.Single();
            variant.KestrelAddress = new Uri(address + "/");
        }
        else
        {
            _ = variant.Server; // start now: migrations run here, not in the middle of the first request
        }

        return variant;
    }

    /// <summary>
    /// A browser-like client (cookies, no redirects, <c>X-Console-Request: 1</c>) over real sockets to a Kestrel variant.
    /// </summary>
    /// <param name="cookies">The cookie jar to use (e.g. shared with a <c>ClientWebSocket</c>); a new one when null.</param>
    /// <returns>The client; log in with <see cref="RunLoginAsync"/>.</returns>
    internal HttpClient CreateKestrelBrowserClient(CookieContainer? cookies = null)
    {
        var address = KestrelAddress ?? throw new InvalidOperationException("Not a Kestrel variant.");
        var handler = new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = true, CookieContainer = cookies ?? new CookieContainer() };
        var client = new HttpClient(handler) { BaseAddress = address };
        client.DefaultRequestHeaders.Add(CsrfHeaderMiddleware.HeaderName, CsrfHeaderMiddleware.HeaderValue);
        return client;
    }

    /// <summary>A pool user unknown to every other test of this host (no groups).</summary>
    /// <returns>The OpenShift username.</returns>
    public string NewUsername() => OAuthServer.NextUser();

    /// <summary>A pool user in the development admin group <c>fleetconsole-admins</c>.</summary>
    /// <returns>The OpenShift username.</returns>
    public string NewAdminUsername() => OAuthServer.NextAdmin();

    /// <summary>Creates a client for the in-process Api. Redirects are not followed so tests see them.</summary>
    /// <returns>An <see cref="HttpClient"/> whose base address is the test server.</returns>
    public HttpClient CreateApiClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <summary>
    /// A browser-like client: keeps cookies, doesn't follow redirects, and sends <c>X-Console-Request: 1</c> on every
    /// request like the SPA's API client.
    /// </summary>
    /// <param name="baseAddress">Optional base address (e.g. <c>https://localhost</c> to test Secure cookies).</param>
    /// <returns>The client.</returns>
    public HttpClient CreateBrowserClient(Uri? baseAddress = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true,
            BaseAddress = baseAddress ?? new Uri("http://localhost"),
        });
        client.DefaultRequestHeaders.Add(CsrfHeaderMiddleware.HeaderName, CsrfHeaderMiddleware.HeaderValue);
        return client;
    }

    /// <summary>
    /// Logs <paramref name="username"/> in through the real flow (login → emulator user picker → callback) and returns
    /// the browser client holding the session cookie.
    /// </summary>
    /// <param name="username">An emulator user (shipped or from the pool).</param>
    /// <returns>A browser client (<see cref="CreateBrowserClient"/>) with a session.</returns>
    /// <exception cref="InvalidOperationException">The login did not end with a session (e.g. the user is deactivated).</exception>
    public async Task<HttpClient> LoginAsAsync(string username)
    {
        var client = CreateBrowserClient();
        using var final = await RunLoginAsync(client, username);
        if (final.StatusCode != HttpStatusCode.Redirect
            || final.Headers.Location?.OriginalString != "/"
            || !final.Headers.TryGetValues("Set-Cookie", out var cookies)
            || !cookies.Any(c => c.StartsWith(SessionDefaults.CookieName + "=", StringComparison.Ordinal)))
        {
            client.Dispose();
            throw new InvalidOperationException(
                $"Login as {username} did not create a session: {(int)final.StatusCode} → {final.Headers.Location}");
        }

        return client;
    }

    /// <summary>
    /// Drives the browser legs of a login with <paramref name="client"/>: <c>GET /api/auth/login</c>; if that redirects
    /// to the emulator, posts the user picker (or Cancel) there and follows the redirect back to the Api's callback.
    /// </summary>
    /// <param name="client">A cookie-keeping client (<see cref="CreateBrowserClient"/>).</param>
    /// <param name="username">The user to pick; ignored when <paramref name="cancel"/>.</param>
    /// <param name="returnUrl">The <c>returnUrl</c> query value, or null to omit it.</param>
    /// <param name="cancel">Press Cancel on the emulator's page instead of picking a user.</param>
    /// <returns>The Api's last response: the callback's, or the login endpoint's when it didn't go to the OAuth server.
    /// The caller disposes it.</returns>
    public async Task<HttpResponseMessage> RunLoginAsync(HttpClient client, string? username, string? returnUrl = null, bool cancel = false)
    {
        ArgumentNullException.ThrowIfNull(client);
        var ct = TestContext.Current.CancellationToken;

        var loginUri = returnUrl is null
            ? "/api/auth/login"
            : QueryHelpers.AddQueryString("/api/auth/login", "returnUrl", returnUrl);
        var login = await client.GetAsync(new Uri(loginUri, UriKind.Relative), ct);
        var authorize = login.Headers.Location;
        if (login.StatusCode != HttpStatusCode.Redirect || authorize is not { IsAbsoluteUri: true } || authorize.AbsolutePath != "/oauth/authorize")
        {
            return login;
        }

        login.Dispose();

        // The emulator's picker form posts the authorize parameters back plus the choice.
        var form = QueryHelpers.ParseQuery(authorize.Query).ToDictionary(p => p.Key, p => p.Value.ToString());
        if (cancel)
        {
            form["cancel"] = "1";
        }
        else
        {
            form["username"] = username ?? throw new ArgumentNullException(nameof(username));
        }

        using var browser = OAuthServer.CreateBrowserClient();
        using var content = new FormUrlEncodedContent(form);
        using var picked = await browser.PostAsync(new Uri("/oauth/authorize", UriKind.Relative), content, ct);
        if (picked.StatusCode != HttpStatusCode.Redirect || picked.Headers.Location is not { } callback)
        {
            throw new InvalidOperationException($"The emulator did not redirect back: {(int)picked.StatusCode}");
        }

        // Back to the Api on the client's own origin (the callback URL's origin is Console:PublicOrigin).
        return await client.GetAsync(new Uri(callback.PathAndQuery, UriKind.Relative), ct);
    }

    /// <summary>Stops the host first (it holds connections), then the emulator and, for the default host, the container.</summary>
    /// <returns>A task that completes when everything is disposed.</returns>
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await OAuthServer.DisposeAsync();
        if (_ownsPostgres)
        {
            await _postgres.DisposeAsync();
        }
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Same key the Aspire AppHost injects (ConnectionStrings__consoledb). Infrastructure reads it lazily, when the
        // first DbContext is created, so setting it here is early enough.
        builder.UseSetting($"ConnectionStrings:{ConsoleDbContext.ConnectionName}", ConnectionString);
        foreach (var (key, value) in TestHostConfiguration.Emulator())
        {
            builder.UseSetting(key, value);
        }

        foreach (var (key, value) in _overrides)
        {
            builder.UseSetting(key, value);
        }

        // Derived hosts that switch to another environment (WithWebHostBuilder + UseEnvironment) can't use the http
        // emulator (https is required outside Development): give them the offline login settings.
        builder.ConfigureAppConfiguration((context, configuration) =>
        {
            if (!context.HostingEnvironment.IsDevelopment())
            {
                configuration.AddInMemoryCollection(TestHostConfiguration.Offline());
            }
        });

        builder.ConfigureLogging(logging =>
        {
            logging.AddProvider(Logs);
            logging.AddFilter<CapturedLogs>(category: null, LogLevel.Debug);
        });

        builder.ConfigureTestServices(services =>
        {
            services.AddHttpClient(OpenShiftHostHttpClient.Name)
                .ConfigurePrimaryHttpMessageHandler(() => HostStub.Handler(OAuthServer.Server.CreateHandler()));
            if (Clock is not null)
            {
                services.AddSingleton<IClock>(Clock);
            }

            _configureServices?.Invoke(services);
        });
    }
}
