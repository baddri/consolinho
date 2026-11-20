using System.Collections.Frozen;
using FleetConsole.Api.Http;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http.Features;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// Writes the proxy's own errors (<see cref="ProxyErrors"/>) as RFC 9457 ProblemDetails with <c>code</c> and
/// <c>traceId</c>, like every other API error. The proxy needs statuses that are not an <see cref="ErrorType"/> (413,
/// 502, 504), so the status comes from a code table (ADR-0019 §8); anything not in the table falls back to the usual
/// <c>ErrorType.ToStatusCode()</c> mapping.
/// </summary>
internal static class ProxyProblems
{
    // CP2 contract §4. Keep in step with ProxyErrors (a unit test checks every code is listed).
    private static readonly FrozenDictionary<string, int> StatusByCode = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        [ProxyErrors.PathNotAllowed.Code] = StatusCodes.Status400BadRequest,
        [ProxyErrors.OriginNotAllowed.Code] = StatusCodes.Status403Forbidden,
        [ProxyErrors.NotAvailableCode] = StatusCodes.Status404NotFound,
        [ProxyErrors.UserReadOnly.Code] = StatusCodes.Status403Forbidden,
        ["Proxy.ReadOnlyGrant"] = StatusCodes.Status403Forbidden,
        ["Proxy.BodyTooLarge"] = StatusCodes.Status413PayloadTooLarge,
        ["Proxy.CredentialRejected"] = StatusCodes.Status502BadGateway,
        ["Proxy.UpstreamUnavailable"] = StatusCodes.Status502BadGateway,
        ["Proxy.UpstreamTls"] = StatusCodes.Status502BadGateway,
        ["Proxy.UpstreamTimeout"] = StatusCodes.Status504GatewayTimeout,
    }.ToFrozenDictionary(StringComparer.Ordinal);

    /// <summary>The HTTP status the proxy answers <paramref name="error"/> with.</summary>
    /// <param name="error">A proxy error, or any other <see cref="Error"/> the authorization pipeline returned.</param>
    /// <returns>The status code.</returns>
    public static int StatusOf(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return StatusByCode.TryGetValue(error.Code, out var status) ? status : error.Type.ToStatusCode();
    }

    /// <summary>
    /// Replaces the response with the ProblemDetails for <paramref name="error"/>. Must be called before the response
    /// has started. A reason phrase copied from an upstream response (e.g. "Unauthorized") is cleared so it can't
    /// contradict the new status.
    /// </summary>
    /// <param name="context">The proxied request.</param>
    /// <param name="error">The error to report.</param>
    /// <returns>A task that completes when the body has been written.</returns>
    public static async Task WriteAsync(HttpContext context, Error error)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(error);

        var problem = error.ToProblemDetails();
        problem.Status = StatusOf(error);

        context.Response.Clear();
        context.Response.StatusCode = problem.Status.Value;
        if (context.Features.Get<IHttpResponseFeature>() is { } response)
        {
            response.ReasonPhrase = null;
        }

        // TryWriteAsync: a client that accepts neither JSON nor problem+json (e.g. protobuf only) still gets the
        // status, just without a body, instead of an exception.
        var problems = context.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = context, ProblemDetails = problem })
            .ConfigureAwait(false);
    }
}
