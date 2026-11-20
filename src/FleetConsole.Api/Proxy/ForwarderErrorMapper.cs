using System.Security.Authentication;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Common;
using Yarp.ReverseProxy.Forwarder;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// Turns a failed forward (YARP's <see cref="ForwarderError"/> plus the exception from <c>IForwarderErrorFeature</c>)
/// into the <c>Proxy.*</c> error the client sees (ADR-0020 §4). Classification is by exception type and
/// <see cref="HttpRequestError"/>, never by message; the resulting errors name the cluster only, so no exception text
/// (which can echo URLs or headers) reaches a response body.
/// </summary>
internal static class ForwarderErrorMapper
{
    /// <summary>Maps a forwarding failure.</summary>
    /// <param name="error">What YARP reports as failed.</param>
    /// <param name="exception">The exception behind it, if any.</param>
    /// <param name="cluster">The cluster name for the error detail.</param>
    /// <param name="maxBodyBytes">The configured body limit, for the 413 detail.</param>
    /// <returns>
    /// The error to report, or <see langword="null"/> when there is nothing to report: no error, or a client-side
    /// failure (the client cancelled or broke its own request) — the client is gone or at fault, so nothing is written.
    /// </returns>
    public static Error? Map(ForwarderError error, Exception? exception, string cluster, long maxBodyBytes)
    {
        // Kestrel enforces IHttpMaxRequestBodySizeFeature while YARP streams a (chunked) body upstream and fails the
        // read with a 413 BadHttpRequestException; YARP reports it as a client-side body error.
        if (FindInner<BadHttpRequestException>(exception) is { StatusCode: StatusCodes.Status413PayloadTooLarge })
        {
            return ProxyErrors.BodyTooLarge(maxBodyBytes);
        }

        return error switch
        {
            ForwarderError.RequestTimedOut or ForwarderError.UpgradeActivityTimeout => ProxyErrors.UpstreamTimeout(cluster),
            ForwarderError.Request
                or ForwarderError.RequestCreation
                or ForwarderError.RequestBodyDestination
                or ForwarderError.ResponseHeaders
                or ForwarderError.ResponseBodyDestination
                or ForwarderError.UpgradeRequestDestination
                or ForwarderError.UpgradeResponseDestination
                or ForwarderError.NoAvailableDestinations => IsTlsFailure(exception)
                    ? ProxyErrors.UpstreamTls(cluster)
                    : ProxyErrors.UpstreamUnavailable(cluster),

            // None, *Canceled and *Client: nothing upstream went wrong.
            _ => null,
        };
    }

    /// <summary>
    /// <see langword="true"/> when the failure is on the client's side (it cancelled or sent a broken request) — not
    /// worth a Warning, and the audit records status 0 when no upstream status exists.
    /// </summary>
    /// <param name="error">What YARP reports as failed.</param>
    /// <returns>Whether the client caused the failure.</returns>
    public static bool IsClientSide(ForwarderError error) => error is ForwarderError.RequestCanceled
        or ForwarderError.RequestBodyCanceled
        or ForwarderError.RequestBodyClient
        or ForwarderError.ResponseBodyCanceled
        or ForwarderError.ResponseBodyClient
        or ForwarderError.UpgradeRequestCanceled
        or ForwarderError.UpgradeRequestClient
        or ForwarderError.UpgradeResponseCanceled
        or ForwarderError.UpgradeResponseClient;

    // Same signals as the probe classification (ClusterProbeSession): the handshake failed, or validation threw.
    private static bool IsTlsFailure(Exception? exception) =>
        FindInner<HttpRequestException>(exception)?.HttpRequestError == HttpRequestError.SecureConnectionError
        || FindInner<AuthenticationException>(exception) is not null;

    private static T? FindInner<T>(Exception? exception)
        where T : Exception
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is T match)
            {
                return match;
            }
        }

        return null;
    }
}
