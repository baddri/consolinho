namespace FleetConsole.Api.Hosting;

/// <summary>
/// Serves the built SPA from the web root (<c>wwwroot</c>) in the single production container (ADR-0006, ADR-0028 §1):
/// static files with cache headers, and an anonymous fallback to <c>index.html</c> so deep links
/// (<c>/c/prod/k8s/ns/a/pods/b</c>) load the SPA, whose router then renders the page.
/// </summary>
/// <remarks>
/// <para><b>Inert without a web root:</b> under <c>aspire run</c> the SPA is served by the Vite dev server and
/// <c>wwwroot</c> does not exist; then neither the middleware nor the fallback is added, so Development behaves exactly
/// as before (and no "web root not found" warning is logged).</para>
/// <para><b>Never under <c>/api</c>:</b> the fallback matches only GET/HEAD, paths without a file extension and paths
/// whose first segment is not <c>api</c> (case-insensitive, the same rule as the CSRF check). Unknown API routes keep
/// their ProblemDetails 404 (ADR-0013) and a missing asset is a plain 404 instead of HTML.</para>
/// <para><b>Caching:</b> <c>index.html</c> (direct or via the fallback) is <c>no-cache</c> so a new deployment is picked
/// up on the next navigation; Vite's content-hashed files under <c>/assets/</c> are immutable for a year. Other static
/// files get no explicit header.</para>
/// </remarks>
public static class SpaHosting
{
    /// <summary>The file every SPA route is answered with.</summary>
    public const string IndexFile = "index.html";

    /// <summary>The route constraint name registered by <see cref="AddSpaHosting"/>.</summary>
    private const string SpaRequestConstraintName = "sparequest";

    // Catch-all without file extension ("nonfile"), GET/HEAD outside /api ("sparequest"). "/" matches too.
    private const string FallbackPattern = "{*path:nonfile:" + SpaRequestConstraintName + "}";

    private static readonly PathString AssetsPath = new("/assets");

    /// <summary>
    /// Registers the route constraint the SPA fallback uses. Call during service registration, before
    /// <see cref="MapSpaFallback"/> is used.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddSpaHosting(this IServiceCollection services)
    {
        services.Configure<RouteOptions>(options => options.SetParameterPolicy<SpaRequestConstraint>(SpaRequestConstraintName));
        return services;
    }

    /// <summary>
    /// Adds the static file middleware for the web root, with the SPA cache headers. Call after
    /// <c>UseCsrfHeaderCheck()</c> and before <c>UseAuthentication()</c>: static files are public and need no session.
    /// </summary>
    /// <param name="app">The web application.</param>
    /// <returns>The same application, for chaining.</returns>
    public static WebApplication UseSpaStaticFiles(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        if (HasWebRoot(app))
        {
            app.UseStaticFiles(CreateStaticFileOptions());
        }

        return app;
    }

    /// <summary>
    /// Maps the anonymous SPA fallback (GET/HEAD, outside <c>/api</c>, no file extension) to <see cref="IndexFile"/>.
    /// Being a fallback endpoint it has the lowest priority, so <c>/health</c>, <c>/alive</c> and every API route win.
    /// </summary>
    /// <param name="app">The web application.</param>
    /// <returns>The same application, for chaining.</returns>
    public static WebApplication MapSpaFallback(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        if (HasWebRoot(app))
        {
            // The fallback serves index.html through its own static file middleware: pass the same options so the
            // fallback response carries the same Cache-Control as a direct /index.html request.
            // The GET/HEAD restriction is part of the route constraint, not HTTP method metadata: the method matcher
            // policy runs before route constraints, so MapFallbackToFile's own GET/HEAD metadata would turn
            // "POST /api/nope" into a 405 from the fallback instead of the API's 404. Metadata without methods (the
            // last one wins) means "any method" to the matcher and lets the constraint decide.
            app.MapFallbackToFile(FallbackPattern, IndexFile, CreateStaticFileOptions())
                .WithMetadata(new HttpMethodMetadata([]))
                .AllowAnonymous();
        }

        return app;
    }

    private static bool HasWebRoot(WebApplication app) =>
        app.Environment.WebRootPath is { } webRoot && Directory.Exists(webRoot);

    private static StaticFileOptions CreateStaticFileOptions() => new()
    {
        OnPrepareResponse = context =>
        {
            var headers = context.Context.Response.Headers;
            if (string.Equals(context.File.Name, IndexFile, StringComparison.OrdinalIgnoreCase))
            {
                headers.CacheControl = "no-cache";
            }
            else if (context.Context.Request.Path.StartsWithSegments(AssetsPath, StringComparison.OrdinalIgnoreCase))
            {
                // Vite puts a content hash in every file name under /assets, so a changed file has a new URL.
                headers.CacheControl = "public, max-age=31536000, immutable";
            }
        },
    };

    /// <summary>
    /// Accepts only GET/HEAD requests whose path is not under the <c>/api</c> segment; the path rule mirrors
    /// <c>CsrfHeaderMiddleware</c>'s (segment match, case-insensitive: <c>/API/x</c> is API, <c>/apix</c> is not). Other
    /// methods find no endpoint and get a 404.
    /// </summary>
    private sealed class SpaRequestConstraint : IRouteConstraint
    {
        private static readonly PathString ApiPath = new("/api");

        /// <inheritdoc />
        public bool Match(HttpContext? httpContext, IRouter? route, string routeKey, RouteValueDictionary values, RouteDirection routeDirection)
        {
            if (httpContext is not null && routeDirection == RouteDirection.IncomingRequest
                && !HttpMethods.IsGet(httpContext.Request.Method) && !HttpMethods.IsHead(httpContext.Request.Method))
            {
                return false;
            }

            // Incoming requests: decide on the real request path. Link generation (not used for the fallback): on
            // the route value.
            var path = httpContext is not null && routeDirection == RouteDirection.IncomingRequest
                ? httpContext.Request.Path
                : new PathString("/" + Convert.ToString(values.GetValueOrDefault(routeKey), System.Globalization.CultureInfo.InvariantCulture));
            return !path.StartsWithSegments(ApiPath, StringComparison.OrdinalIgnoreCase);
        }
    }
}
