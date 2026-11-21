namespace FleetConsole.Api.Http;

/// <summary>
/// Sets the browser security headers of ADR-0029 (SECURITY.md "HTTP") on <b>every</b> response the Api sends: the SPA
/// document and assets, API JSON, ProblemDetails, probes and proxied Kubernetes responses.
/// </summary>
/// <remarks>
/// <para><b>Why <c>OnStarting</c>:</b> the headers are written in a <see cref="HttpResponse.OnStarting(Func{Task})"/>
/// callback, i.e. just before the first byte goes out, not when this middleware runs. That way they survive what later
/// code does to the response: the exception handler clears the headers before writing its 500 problem, and YARP copies
/// the upstream (Kubernetes) headers, which may include its own <c>Content-Security-Policy</c>. Indexer assignment
/// overwrites any such value, so ours always wins.</para>
/// <para>The values are constants rather than configuration (ADR-0029 §1): there is no operator path to weaken them.
/// HSTS is deliberately absent; the app only sees HTTP behind the Route, which adds it (ADR-0030).</para>
/// </remarks>
/// <param name="next">The rest of the pipeline.</param>
internal sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    /// <summary>
    /// The Content-Security-Policy — the ADR-0029 contract, pinned byte-for-byte by the tests. Same-origin only.
    /// Relaxations: <c>style-src 'unsafe-inline'</c> because Monaco injects <c>&lt;style&gt;</c> elements at runtime;
    /// <c>img-src</c>/<c>font-src data:</c> because PatternFly CSS uses data-URI SVGs and Vite may inline small fonts;
    /// <c>worker-src 'self'</c> for the bundled Monaco editor worker (no <c>blob:</c>). Scripts are <c>'self'</c> only
    /// (no inline scripts, no <c>eval</c>). Changing it needs an ADR amendment.
    /// </summary>
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self'; frame-ancestors 'none'";

    /// <summary>Stops browsers from MIME-sniffing a response into an executable type (e.g. a pod log as script).</summary>
    public const string ContentTypeOptions = "nosniff";

    /// <summary>Sends no referrer anywhere, so cluster/namespace/resource names in URLs never leak to other origins.</summary>
    public const string ReferrerPolicy = "no-referrer";

    /// <summary>Forbids framing (clickjacking); the legacy twin of CSP <c>frame-ancestors 'none'</c> for old browsers.</summary>
    public const string FrameOptions = "DENY";

    /// <summary>Isolates the console's browsing context group from windows of other origins (no cross-origin <c>window.opener</c>).</summary>
    public const string CrossOriginOpenerPolicy = "same-origin";

    /// <summary>Registers the callback that writes the headers, then runs the rest of the pipeline.</summary>
    /// <param name="context">The current request.</param>
    /// <returns>A task that completes when the request has been handled.</returns>
    public Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        context.Response.OnStarting(static state =>
        {
            Apply(((HttpContext)state).Response.Headers);
            return Task.CompletedTask;
        }, context);

        return next(context);
    }

    // Indexer assignment, not Append/TryAdd: an upstream value (YARP copies Kubernetes' headers) must be replaced.
    private static void Apply(IHeaderDictionary headers)
    {
        headers.ContentSecurityPolicy = ContentSecurityPolicy;
        headers.XContentTypeOptions = ContentTypeOptions;
        headers["Referrer-Policy"] = ReferrerPolicy;
        headers.XFrameOptions = FrameOptions;
        headers["Cross-Origin-Opener-Policy"] = CrossOriginOpenerPolicy;
    }
}

/// <summary>Registers <see cref="SecurityHeadersMiddleware"/> in the request pipeline.</summary>
public static class SecurityHeadersMiddlewareExtensions
{
    /// <summary>
    /// Adds the ADR-0029 security headers to every response. Call right after <c>UseExceptionHandler()</c> and before
    /// <c>UseStatusCodePages()</c>, the CSRF check and <c>UseSpaStaticFiles()</c>, so every response produced after
    /// it — including short-circuited ones (static files, 403 CSRF) and the exception handler's re-executed 500 — gets them.
    /// </summary>
    /// <param name="app">The application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) =>
        app.UseMiddleware<SecurityHeadersMiddleware>();
}
