using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Authentication;
using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// Turns the ways a read-only call to a Kubernetes API server can fail (HTTP status, network, TLS, unusable answer) into
/// a <see cref="ProbeFailure"/> with an admin-facing message that never contains upstream text.
/// </summary>
/// <remarks>
/// Shared by the connection test (<see cref="ClusterProbeSession"/>, ADR-0011) and the fleet health reader
/// (<c>Health/ClusterHealthReader</c>, ADR-0041), so both report the same <see cref="ProbeFailureKind"/> for the same
/// cause. The messages only name the host, which the admin configured; never the token, a body or response headers.
/// </remarks>
internal static class ProbeFailureClassifier
{
    /// <summary>Maps a non-success status: 401/403/404 → Unauthorized/Forbidden/NotFound, anything else → UnexpectedStatus.</summary>
    /// <param name="statusCode">The upstream status.</param>
    /// <param name="host">The API server host, for the message.</param>
    /// <returns>The failure.</returns>
    public static ProbeFailure FromStatus(HttpStatusCode statusCode, string host) => statusCode switch
    {
        HttpStatusCode.Unauthorized => new ProbeFailure(ProbeFailureKind.Unauthorized,
            "The API server rejected the token (401 Unauthorized). It may be expired, revoked or for another cluster."),
        HttpStatusCode.Forbidden => new ProbeFailure(ProbeFailureKind.Forbidden,
            "The token is not allowed to make this request (403 Forbidden)."),
        HttpStatusCode.NotFound => new ProbeFailure(ProbeFailureKind.NotFound,
            "The API server does not serve this endpoint (404 Not Found)."),
        _ => new ProbeFailure(ProbeFailureKind.UnexpectedStatus,
            $"The API server at {host} answered with HTTP {(int)statusCode}."),
    };

    /// <summary>
    /// Maps a transport failure: name resolution → DnsFailure; TLS handshake → the kind <paramref name="tls"/> recorded
    /// (TlsOther when there is no record, e.g. on a pooled handler shared by concurrent requests); connect timeout →
    /// Timeout; refused, unreachable or reset → ConnectionRefused; a malformed or oversized HTTP answer → InvalidResponse.
    /// </summary>
    /// <param name="exception">The exception <see cref="HttpMessageInvoker.SendAsync"/> threw.</param>
    /// <param name="host">The API server host, for the message.</param>
    /// <param name="tls">The handler's certificate-rejection record, when the caller owns the handler exclusively.</param>
    /// <returns>The failure.</returns>
    public static ProbeFailure FromHttpRequestException(HttpRequestException exception, string host, TlsValidationRecord? tls)
    {
        ArgumentNullException.ThrowIfNull(exception);
        var socketError = FindInner<SocketException>(exception)?.SocketErrorCode;

        if (exception.HttpRequestError == HttpRequestError.NameResolutionError ||
            socketError is SocketError.HostNotFound or SocketError.TryAgain or SocketError.NoData)
        {
            return new ProbeFailure(ProbeFailureKind.DnsFailure,
                $"The host name {host} could not be resolved. Check the API URL and DNS from the console.");
        }

        if (exception.HttpRequestError == HttpRequestError.SecureConnectionError || FindInner<AuthenticationException>(exception) is not null)
        {
            return (tls?.Classify() ?? ProbeFailureKind.TlsOther) switch
            {
                ProbeFailureKind.TlsUnknownAuthority => new ProbeFailure(ProbeFailureKind.TlsUnknownAuthority,
                    $"The certificate of {host} is not signed by a trusted certificate authority. Provide the cluster's CA bundle."),
                ProbeFailureKind.TlsCertificateExpired => new ProbeFailure(ProbeFailureKind.TlsCertificateExpired,
                    $"The certificate of {host} has expired or is not yet valid."),
                ProbeFailureKind.TlsHostnameMismatch => new ProbeFailure(ProbeFailureKind.TlsHostnameMismatch,
                    $"The certificate presented by the API server is not issued for {host}."),
                _ => new ProbeFailure(ProbeFailureKind.TlsOther, $"The TLS handshake with {host} failed."),
            };
        }

        if (socketError is SocketError.TimedOut)
        {
            return new ProbeFailure(ProbeFailureKind.Timeout, $"Connecting to {host} timed out.");
        }

        if (socketError is SocketError.ConnectionRefused)
        {
            return new ProbeFailure(ProbeFailureKind.ConnectionRefused,
                $"{host} refused the connection. Check the API URL and port.");
        }

        if (exception.HttpRequestError is HttpRequestError.ConfigurationLimitExceeded or HttpRequestError.InvalidResponse)
        {
            return InvalidResponse(host);
        }

        // Network unreachable, connection reset, proxy errors…: there is no finer category the admin could act on.
        return new ProbeFailure(ProbeFailureKind.ConnectionRefused,
            $"Could not connect to {host}. Check the API URL and that the console can reach the cluster's network.");
    }

    /// <summary>The answer arrived but is not what a Kubernetes API server sends (not JSON, wrong kind, oversized…).</summary>
    /// <param name="host">The API server host, for the message.</param>
    /// <returns>The failure.</returns>
    public static ProbeFailure InvalidResponse(string host) => new(ProbeFailureKind.InvalidResponse,
        $"The server at {host} did not answer like a Kubernetes API server. Check the API URL.");

    /// <summary>The per-request timeout elapsed (not the caller's cancellation, which propagates instead).</summary>
    /// <param name="host">The API server host, for the message.</param>
    /// <returns>The failure.</returns>
    public static ProbeFailure Timeout(string host) =>
        new(ProbeFailureKind.Timeout, $"The API server at {host} did not answer in time.");

    private static T? FindInner<T>(Exception exception)
        where T : Exception
    {
        for (var current = exception.InnerException; current is not null; current = current.InnerException)
        {
            if (current is T match)
            {
                return match;
            }
        }

        return null;
    }
}
