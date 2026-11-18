using FleetConsole.Domain.Common;

namespace FleetConsole.Api.Http;

/// <summary>
/// CSRF defence for the API (ADR-0012, AUTH-13): every request under <c>/api</c> whose method is not
/// GET/HEAD/OPTIONS must carry <c>X-Console-Request: 1</c>; otherwise it is answered with 403 ProblemDetails
/// (<c>code</c> <c>Auth.CsrfHeaderMissing</c>) and nothing after this middleware runs.
/// </summary>
/// <remarks>
/// <para><b>Why a header works:</b> a custom header makes any cross-site <c>fetch</c> a CORS preflight, and the Api
/// enables no CORS, so another site can't send it; plain HTML forms can't set headers at all. Together with
/// <c>SameSite=Lax</c> this blocks cross-site state changes.</para>
/// <para><b>Why middleware:</b> it runs before authentication and before any endpoint executes (minimal hosting matches
/// the route earlier, but binding and the handler run in the endpoint middleware at the end), so unknown routes,
/// anonymous endpoints, malformed bodies and the OAuth handler are all covered, and a missing header always yields 403
/// rather than 400/404/405. There are no path exemptions, and only GET/HEAD/OPTIONS are exempt by method (contract §1); every
/// other method, including TRACE and unknown ones, fails closed. GET endpoints must therefore stay side-effect free.</para>
/// <para>Path matching is by segment and case-insensitive (like routing): <c>/api</c> and <c>/API/x</c> are checked,
/// <c>/apix</c> is not.</para>
/// </remarks>
/// <param name="next">The rest of the pipeline.</param>
/// <param name="logger">Logs rejected requests (method and path only).</param>
internal sealed partial class CsrfHeaderMiddleware(RequestDelegate next, ILogger<CsrfHeaderMiddleware> logger)
{
    /// <summary>The header the SPA's API client sends on every request.</summary>
    public const string HeaderName = "X-Console-Request";

    /// <summary>The only accepted header value.</summary>
    public const string HeaderValue = "1";

    /// <summary>The error returned when the header is missing or wrong (contract §2).</summary>
    public static readonly Error MissingHeader = Error.Forbidden("Auth.CsrfHeaderMissing", "Missing CSRF header.");

    private static readonly PathString ApiPath = new("/api");

    /// <summary>Checks the request and either rejects it or passes it on.</summary>
    /// <param name="context">The current request.</param>
    /// <param name="problemDetailsService">Writes the 403 body with the API's ProblemDetails customizations.</param>
    /// <returns>A task that completes when the request has been handled.</returns>
    public async Task InvokeAsync(HttpContext context, IProblemDetailsService problemDetailsService)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(problemDetailsService);

        if (!RequiresHeader(context.Request) || HasValidHeader(context.Request))
        {
            await next(context).ConfigureAwait(false);
            return;
        }

        LogRejected(logger, context.Request.Method, context.Request.Path);

        var problem = MissingHeader.ToProblemDetails();
        context.Response.StatusCode = problem.Status!.Value;
        await problemDetailsService.WriteAsync(new ProblemDetailsContext { HttpContext = context, ProblemDetails = problem })
            .ConfigureAwait(false);
    }

    private static bool RequiresHeader(HttpRequest request) =>
        request.Path.StartsWithSegments(ApiPath, StringComparison.OrdinalIgnoreCase)
        && !(HttpMethods.IsGet(request.Method)
             || HttpMethods.IsHead(request.Method)
             || HttpMethods.IsOptions(request.Method));

    // Exactly one header value, exactly "1": a repeated header ("1, 1") is not something our client sends.
    private static bool HasValidHeader(HttpRequest request) =>
        request.Headers.TryGetValue(HeaderName, out var values)
        && values.Count == 1
        && string.Equals(values[0], HeaderValue, StringComparison.Ordinal);

    [LoggerMessage(EventId = 2100, Level = LogLevel.Information, Message = "Rejected {Method} {Path}: missing or invalid CSRF header")]
    private static partial void LogRejected(ILogger logger, string method, PathString path);
}

/// <summary>Registers <see cref="CsrfHeaderMiddleware"/> in the request pipeline.</summary>
public static class CsrfHeaderMiddlewareExtensions
{
    /// <summary>
    /// Adds the CSRF header check. Call after <c>UseStatusCodePages()</c> and before <c>UseAuthentication()</c>
    /// (ADR-0012), so it precedes authentication, authorization and every endpoint (including body binding).
    /// </summary>
    /// <param name="app">The application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IApplicationBuilder UseCsrfHeaderCheck(this IApplicationBuilder app) =>
        app.UseMiddleware<CsrfHeaderMiddleware>();
}
