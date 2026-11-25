using FleetConsole.Api.Endpoints.Admin;
using FleetConsole.Api.Proxy;

namespace FleetConsole.Api.Endpoints;

/// <summary>
/// Root of the console's own REST API: creates the <c>/api</c> route group, applies the conventions every API endpoint
/// shares, and maps each feature's endpoints into it (one <c>Map&lt;Feature&gt;Endpoints()</c> extension per feature).
/// </summary>
/// <remarks>
/// <para><b>Adding a feature:</b> create <c>Endpoints/&lt;Feature&gt;Endpoints.cs</c> with a
/// <c>Map&lt;Feature&gt;Endpoints(this IEndpointRouteBuilder api)</c> extension and call it from
/// <see cref="MapApiEndpoints"/>. Administration endpoints go into <c>Endpoints/Admin/</c> and are mapped by
/// <see cref="AdminEndpoints.MapAdminEndpoints"/>.</para>
/// <para><b>Authorization:</b> the whole group requires an authenticated session. An endpoint that must be reachable
/// without one opts out with <c>.AllowAnonymous()</c> and must be on ADR-0012's list; an integration test enumerates
/// the endpoints and fails for anything else. <b>CSRF</b> is not an endpoint concern: <c>CsrfHeaderMiddleware</c>
/// checks every unsafe <c>/api</c> request before authentication (ADR-0012).</para>
/// <para><b>Error responses in OpenAPI:</b> endpoints return <c>ToHttpResult()</c> unions whose
/// <c>ProblemHttpResult</c> arm carries no response metadata (its status varies per instance), so every error status
/// the API can produce is declared once here. Some endpoints are therefore documented with statuses they never
/// return; the frontend needs the ProblemDetails schema, not an exact per-endpoint status list (T-0002 review).</para>
/// </remarks>
public static class ApiEndpoints
{
    /// <summary>Maps <c>/api</c> and all feature endpoint groups beneath it.</summary>
    /// <param name="app">The application's route builder.</param>
    /// <returns>The <c>/api</c> group.</returns>
    public static RouteGroupBuilder MapApiEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        // Default policy = authenticated session (cookie scheme). Anonymous exceptions: ADR-0012.
        api.RequireAuthorization();

        api.ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status500InternalServerError);

        api.MapAuthEndpoints();
        api.MapSystemEndpoints();
        api.MapClustersEndpoints();
        api.MapFleetEndpoints();
        api.MapKubernetesProxy();
        api.MapAdminEndpoints();

        return api;
    }
}
