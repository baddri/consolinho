using System.Text.Json;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace FleetConsole.Api.Http;

/// <summary>
/// The single place where use case outcomes become HTTP responses. Failures become RFC 9457 ProblemDetails with a
/// status derived from <see cref="ErrorType"/>, so status codes are consistent across the whole API.
/// </summary>
/// <example>
/// Endpoint handlers declare the typed union as their return type so minimal APIs emit OpenAPI response metadata
/// (the frontend's generated types depend on it):
/// <code>
/// static async Task&lt;Results&lt;Ok&lt;SystemInfoDto&gt;, ProblemHttpResult&gt;&gt; GetInfo(IDispatcher dispatcher, CancellationToken ct) =&gt;
///     (await dispatcher.Send(new GetSystemInfoQuery(), ct)).ToHttpResult();
/// </code>
/// </example>
/// <remarks>
/// <para>Mapping: Validation → 400 (with an <c>errors</c> dictionary for <see cref="ValidationError"/>), Unauthorized → 401,
/// Forbidden → 403, NotFound → 404, Conflict → 409, Failure → 500.</para>
/// <para>Every problem carries the stable <see cref="Error.Code"/> as the <c>code</c> extension member so clients can
/// branch on it, and <see cref="Error.Message"/> as <c>detail</c>. <c>type</c>/<c>title</c> are filled from the status
/// by ASP.NET Core, and <c>traceId</c>/<c>instance</c> by <see cref="ProblemDetailsSetup"/>.</para>
/// </remarks>
public static class ResultExtensions
{
    /// <summary>Name of the ProblemDetails extension member carrying <see cref="Error.Code"/>.</summary>
    public const string ErrorCodeExtension = "code";

    /// <summary>Maps a value-less result: success → <c>204 No Content</c>, failure → ProblemDetails.</summary>
    /// <param name="result">The use case outcome.</param>
    /// <returns>A typed union, so the endpoint's OpenAPI metadata describes both outcomes without <c>.Produces</c> calls.</returns>
    public static Results<NoContent, ProblemHttpResult> ToHttpResult(this Result result)
    {
        ArgumentNullException.ThrowIfNull(result);

        // if/else rather than a ternary: the two arms only unify through Results<,>'s implicit conversions.
        if (result.IsSuccess)
        {
            return TypedResults.NoContent();
        }

        return result.ToProblemDetails();
    }

    /// <summary>Maps a result with a value: success → <c>200 OK</c> with the value as JSON, failure → ProblemDetails.</summary>
    /// <typeparam name="TValue">The value type; it becomes the documented 200 response schema.</typeparam>
    /// <param name="result">The use case outcome.</param>
    /// <returns>A typed union, so the endpoint's OpenAPI metadata describes both outcomes without <c>.Produces</c> calls.</returns>
    public static Results<Ok<TValue>, ProblemHttpResult> ToHttpResult<TValue>(this Result<TValue> result)
    {
        ArgumentNullException.ThrowIfNull(result);

        if (result.IsSuccess)
        {
            return TypedResults.Ok(result.Value);
        }

        return result.ToProblemDetails();
    }

    /// <summary>
    /// Maps a result with a value using a custom typed success response (e.g. <c>201 Created</c> with a location),
    /// while failures still go through the central ProblemDetails mapping.
    /// </summary>
    /// <example><c>return result.ToHttpResult(id =&gt; TypedResults.Created($"/api/admin/clusters/{id}", id));</c></example>
    /// <typeparam name="TValue">The value type.</typeparam>
    /// <typeparam name="TSuccess">The typed success result (e.g. <c>Created&lt;Guid&gt;</c>); must be a concrete
    /// <c>TypedResults</c> type so its OpenAPI metadata is emitted.</typeparam>
    /// <param name="result">The use case outcome.</param>
    /// <param name="onSuccess">Builds the success response from the value.</param>
    /// <returns>A typed union of the success response and ProblemDetails.</returns>
    public static Results<TSuccess, ProblemHttpResult> ToHttpResult<TValue, TSuccess>(this Result<TValue> result, Func<TValue, TSuccess> onSuccess)
        where TSuccess : IResult
    {
        ArgumentNullException.ThrowIfNull(result);
        ArgumentNullException.ThrowIfNull(onSuccess);

        if (result.IsSuccess)
        {
            return onSuccess(result.Value);
        }

        return result.ToProblemDetails();
    }

    /// <summary>Turns a failed result into a ProblemDetails HTTP result.</summary>
    /// <param name="result">A failed result.</param>
    /// <returns>A <see cref="ProblemHttpResult"/> whose status matches the error type.</returns>
    /// <exception cref="InvalidOperationException">When <paramref name="result"/> is successful (a bug in the caller).</exception>
    public static ProblemHttpResult ToProblemDetails(this Result result)
    {
        ArgumentNullException.ThrowIfNull(result);
        if (result.IsSuccess)
        {
            throw new InvalidOperationException("A successful result cannot be converted to ProblemDetails.");
        }

        return TypedResults.Problem(result.Error.ToProblemDetails());
    }

    /// <summary>
    /// Builds the ProblemDetails body for an error. A <see cref="ValidationError"/> becomes
    /// <see cref="HttpValidationProblemDetails"/> whose <c>errors</c> keys follow the API's camelCase JSON naming, so
    /// they match the request's JSON property names (e.g. <c>Endpoints[0].Url</c> → <c>endpoints[0].url</c>).
    /// </summary>
    /// <param name="error">The error to describe.</param>
    /// <returns>The ProblemDetails, with <see cref="ProblemDetails.Status"/> set.</returns>
    public static ProblemDetails ToProblemDetails(this Error error)
    {
        ArgumentNullException.ThrowIfNull(error);

        var status = error.Type.ToStatusCode();
        ProblemDetails problem = error is ValidationError validation
            ? new HttpValidationProblemDetails(ToJsonFieldNames(validation.Errors))
            {
                // The generic "One or more validation errors occurred." is already the default title; the field
                // messages carry the detail.
                Status = status,
            }
            : new ProblemDetails { Status = status, Detail = error.Message };

        problem.Extensions[ErrorCodeExtension] = error.Code;
        return problem;
    }

    /// <summary>Maps an error category to its HTTP status code. Unknown values map to 500 so they fail loudly.</summary>
    /// <param name="errorType">The error category.</param>
    /// <returns>The HTTP status code.</returns>
    public static int ToStatusCode(this ErrorType errorType) => errorType switch
    {
        ErrorType.Validation => StatusCodes.Status400BadRequest,
        ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
        ErrorType.Forbidden => StatusCodes.Status403Forbidden,
        ErrorType.NotFound => StatusCodes.Status404NotFound,
        ErrorType.Conflict => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status500InternalServerError,
    };

    private static Dictionary<string, string[]> ToJsonFieldNames(IReadOnlyDictionary<string, string[]> errors) =>
        errors
            .GroupBy(pair => ToJsonFieldName(pair.Key), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.SelectMany(pair => pair.Value).ToArray(), StringComparer.Ordinal);

    // Validators report C# property paths ("Endpoints[0].Url"); convert each segment with the same camelCase policy
    // the API's JSON serializer uses (ASP.NET Core web defaults) so the UI can map messages to its form fields.
    private static string ToJsonFieldName(string propertyPath) =>
        string.Join('.', propertyPath.Split('.').Select(JsonNamingPolicy.CamelCase.ConvertName));
}
