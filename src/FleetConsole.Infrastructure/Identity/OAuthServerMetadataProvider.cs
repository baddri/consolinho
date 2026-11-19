using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Auth;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// <see cref="IOAuthServerMetadataProvider"/> for the host cluster (ADR-0010). Static endpoints from configuration win
/// and are available immediately; otherwise <c>{HostApiServerUrl}/.well-known/oauth-authorization-server</c> is fetched
/// on demand.
/// </summary>
/// <remarks>
/// <para><b>Caching:</b> a successful load is kept for the process lifetime (the OAuth route of a cluster practically
/// never moves; a restart picks up a change). A failed load is logged as a warning (host and error type only) and not
/// retried before <see cref="RetryInterval"/> has passed on <see cref="IClock"/>; calls in that window return
/// <see langword="null"/> at once, so a dead host can't make every login wait for a timeout.</para>
/// <para><b>Scheme:</b> discovered endpoints must be <c>https</c> unless the host URL itself is <c>http</c> (which the
/// options validator allows in Development only); otherwise the document is rejected like a failed load.</para>
/// <para><b>Concurrency:</b> singleton; one load at a time (callers arriving meanwhile wait for it and share its result).</para>
/// </remarks>
internal sealed partial class OAuthServerMetadataProvider : IOAuthServerMetadataProvider, IDisposable
{
    /// <summary>Minimum time between two discovery attempts after a failure.</summary>
    public static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(10);

    /// <summary>The RFC 8414 discovery path, relative to the host API server URL.</summary>
    internal const string DiscoveryPath = ".well-known/oauth-authorization-server";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly OpenShiftHostOptions _options;
    private readonly IClock _clock;
    private readonly ILogger<OAuthServerMetadataProvider> _logger;
    private readonly SemaphoreSlim _loadGate = new(1, 1);
    private volatile OAuthServerMetadata? _current;
    // UTC ticks, read and written with Volatile: a DateTimeOffset field could be read torn by the unlocked fast path.
    private long _retryNotBeforeTicks = DateTimeOffset.MinValue.UtcTicks;

    /// <summary>Creates the provider; static endpoints, when configured, are its value from the start.</summary>
    /// <param name="httpClientFactory">Supplies the <see cref="OpenShiftHostHttpClient.Name"/> client.</param>
    /// <param name="options">The host options.</param>
    /// <param name="clock">Time source for the retry window.</param>
    /// <param name="logger">Logger.</param>
    public OAuthServerMetadataProvider(
        IHttpClientFactory httpClientFactory,
        IOptions<OpenShiftHostOptions> options,
        IClock clock,
        ILogger<OAuthServerMetadataProvider> logger)
    {
        ArgumentNullException.ThrowIfNull(options);
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _clock = clock;
        _logger = logger;

        if (_options.HasStaticEndpoints)
        {
            _current = new OAuthServerMetadata(_options.AuthorizationEndpoint!, _options.TokenEndpoint!);
        }
    }

    /// <inheritdoc />
    public OAuthServerMetadata? Current => _current;

    /// <inheritdoc />
    public async ValueTask<OAuthServerMetadata?> GetAsync(CancellationToken cancellationToken)
    {
        if (_current is { } cached)
        {
            return cached;
        }

        if (InRetryWindow())
        {
            return null;
        }

        OAuthServerMetadata? loaded;
        await _loadGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // Re-check: another caller may have loaded or failed while we waited.
            if (_current is { } loadedMeanwhile)
            {
                return loadedMeanwhile;
            }

            if (InRetryWindow())
            {
                return null;
            }

            loaded = await FetchAsync(cancellationToken).ConfigureAwait(false);
            if (loaded is null)
            {
                Volatile.Write(ref _retryNotBeforeTicks, (_clock.UtcNow + RetryInterval).UtcTicks);
                return null;
            }

            _current = loaded;
        }
        finally
        {
            _loadGate.Release();
        }

        return loaded;
    }

    /// <inheritdoc />
    public void Dispose() => _loadGate.Dispose();

    private bool InRetryWindow() => _clock.UtcNow.UtcTicks < Volatile.Read(ref _retryNotBeforeTicks);

    /// <summary>One discovery request; <see langword="null"/> on any failure except cancellation by the caller.</summary>
    private async Task<OAuthServerMetadata?> FetchAsync(CancellationToken cancellationToken)
    {
        var uri = HostUri.Resolve(_options.HostApiServerUrl!, DiscoveryPath);
        try
        {
            var client = _httpClientFactory.CreateClient(OpenShiftHostHttpClient.Name);
            using var response = await client.GetAsync(uri, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                Log.DiscoveryFailed(_logger, uri.Host, $"HTTP {(int)response.StatusCode}");
                return null;
            }

            var document = await response.Content.ReadFromJsonAsync<DiscoveryDocument>(cancellationToken).ConfigureAwait(false);
            // http endpoints only when the host itself is http (possible in Development only, validator): an https
            // host must never send the client secret, codes or tokens to a cleartext endpoint.
            var allowHttp = uri.Scheme == Uri.UriSchemeHttp;
            if (!TryParseEndpoint(document?.AuthorizationEndpoint, allowHttp, out var authorize)
                || !TryParseEndpoint(document?.TokenEndpoint, allowHttp, out var token))
            {
                Log.DiscoveryFailed(_logger, uri.Host, allowHttp ? "document without absolute endpoints" : "document without https endpoints");
                return null;
            }

            Log.DiscoveryLoaded(_logger, uri.Host);
            return new OAuthServerMetadata(authorize, token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or TaskCanceledException)
        {
            // TaskCanceledException without caller cancellation = the client timeout.
            Log.DiscoveryFailed(_logger, uri.Host, exception.GetType().Name);
            return null;
        }
    }

    private static bool TryParseEndpoint(string? value, bool allowHttp, out Uri endpoint) =>
        Uri.TryCreate(value, UriKind.Absolute, out endpoint!)
        && (endpoint.Scheme == Uri.UriSchemeHttps || (allowHttp && endpoint.Scheme == Uri.UriSchemeHttp));

    /// <summary>The fields of the RFC 8414 document FleetConsole reads.</summary>
    private sealed record DiscoveryDocument(
        [property: JsonPropertyName("authorization_endpoint")] string? AuthorizationEndpoint,
        [property: JsonPropertyName("token_endpoint")] string? TokenEndpoint);

    /// <summary>Source-generated log messages (host and failure kind only).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 3310, Level = LogLevel.Warning,
            Message = "OAuth discovery on host API server {Host} failed ({Reason}); logins are unavailable until it succeeds (retry in 10 s)")]
        public static partial void DiscoveryFailed(ILogger logger, string host, string reason);

        [LoggerMessage(EventId = 3311, Level = LogLevel.Information,
            Message = "OAuth server metadata loaded from host API server {Host}")]
        public static partial void DiscoveryLoaded(ILogger logger, string host);
    }
}
