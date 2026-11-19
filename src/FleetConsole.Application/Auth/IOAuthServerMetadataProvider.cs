namespace FleetConsole.Application.Auth;

/// <summary>
/// Supplies the host OAuth server's endpoints without making the Api depend on the host cluster being up at startup
/// (AUTH-14, ADR-0010): the value is loaded lazily, cached once loaded, and failed loads are retried on demand at most
/// every 10 seconds.
/// </summary>
/// <remarks>
/// Implemented by the singleton <c>Infrastructure/Identity/OAuthServerMetadataProvider</c> and warmed at startup.
/// <c>GET /api/auth/login</c> awaits <see cref="GetAsync"/> before challenging; the Api's OAuth options read
/// <see cref="Current"/> and are rebuilt when <see cref="MetadataChanged"/> fires.
/// </remarks>
public interface IOAuthServerMetadataProvider
{
    /// <summary>The last successfully loaded (or statically configured) metadata; <see langword="null"/> until then.</summary>
    OAuthServerMetadata? Current { get; }

    /// <summary>
    /// Returns the metadata, loading it first if needed. Never throws for an unreachable host: returns
    /// <see langword="null"/> instead (logged as a warning), and does not try again before the retry window has passed.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The metadata, or <see langword="null"/> while unavailable.</returns>
    ValueTask<OAuthServerMetadata?> GetAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Raised when the metadata first loads or changes, so the Api can evict its cached OAuth options
    /// (<c>IOptionsMonitorCache</c>). Not raised for static configuration, which is available from the start.
    /// </summary>
    event Action? MetadataChanged;
}
