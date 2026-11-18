namespace FleetConsole.Api.Endpoints;

/// <summary>
/// Root of the console's own REST API: creates the <c>/api</c> route group, applies the conventions every API endpoint
/// shares, and maps each feature's endpoints into it (one <c>Map&lt;Feature&gt;Endpoints()</c> extension per feature).
/// </summary>
/// <remarks>
/// <para><b>Adding a feature:</b> create <c>Endpoints/&lt;Feature&gt;Endpoints.cs</c> with a
/// <c>Map&lt;Feature&gt;Endpoints(this IEndpointRouteBuilder api)</c> extension and call it from
/// <see cref="MapApiEndpoints"/>. Shared filters (auth, CSRF header check) are added here, once.</para>
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

        api.ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status500InternalServerError);

        api.MapSystemEndpoints();

        return api;
    }
}
