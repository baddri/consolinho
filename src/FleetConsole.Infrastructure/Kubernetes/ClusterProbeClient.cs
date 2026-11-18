using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// The <see cref="IClusterProbeClient"/> adapter: each <see cref="Open"/> builds a short-lived TLS handler for the
/// cluster (<see cref="ClusterTlsHandlerFactory"/>) and an <see cref="HttpClient"/> over it, wrapped in a
/// <see cref="ClusterProbeSession"/> that speaks the five Kubernetes calls of the connection test (ADR-0011).
/// </summary>
/// <remarks>
/// Registered as a singleton: it holds no per-cluster state. Sessions are cheap and never pooled — a test run must see
/// the cluster's <em>current</em> TLS settings and must not reuse a connection another token authenticated on.
/// </remarks>
/// <param name="tlsHandlerFactory">Builds the per-session handler.</param>
/// <param name="logger">Logs categorized failures (never tokens or bodies).</param>
/// <param name="requestTimeout">Per-request timeout; a call exceeding it fails with
/// <see cref="ProbeFailureKind.Timeout"/>.</param>
internal sealed class ClusterProbeClient(
    ClusterTlsHandlerFactory tlsHandlerFactory, ILogger<ClusterProbeClient> logger, TimeSpan requestTimeout) : IClusterProbeClient
{
    /// <summary>
    /// Default per-request timeout. Below the connection test's 15 s overall budget, so a single hanging call surfaces
    /// as a <see cref="ProbeFailureKind.Timeout"/> of that step rather than consuming the whole budget silently.
    /// </summary>
    public static readonly TimeSpan DefaultRequestTimeout = TimeSpan.FromSeconds(10);

    /// <inheritdoc />
    /// <exception cref="ArgumentException"><see cref="ClusterConnection.ApiUrl"/> is not an absolute <c>https</c> URL.</exception>
    public IClusterProbeSession Open(ClusterConnection connection, SensitiveString token)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(token);

        // This adapter is where the token is revealed, so it enforces https itself rather than trusting callers (the
        // Domain's apiUrl rule): over http:// the bearer token would travel in cleartext. A caller passing anything
        // else has a bug, hence an exception rather than a probe failure.
        if (!connection.ApiUrl.IsAbsoluteUri || connection.ApiUrl.Scheme != Uri.UriSchemeHttps)
        {
            throw new ArgumentException("The cluster API URL must be an absolute https URL.", nameof(connection));
        }

        ClusterTlsHandler tlsHandler;
        try
        {
            tlsHandler = tlsHandlerFactory.Create(connection);
        }
        catch (InvalidCaBundleException)
        {
            // Not an exception for the caller: the connection test reports it as a failed reachability step.
            return ClusterProbeSession.Failed(
                connection,
                new ProbeFailure(ProbeFailureKind.TlsOther, "The cluster's CA bundle could not be read. Re-enter it in PEM format."),
                logger);
        }

        return ClusterProbeSession.Create(connection, token, tlsHandler, requestTimeout, logger);
    }
}
