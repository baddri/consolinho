using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace FleetConsole.Api.Http;

/// <summary>
/// Documents FleetConsole's ProblemDetails extension members — <c>code</c> (<see cref="ResultExtensions.ErrorCodeExtension"/>)
/// and <c>traceId</c> (<see cref="ProblemDetailsSetup.TraceIdExtension"/>) — on the <c>ProblemDetails</c> and
/// <c>HttpValidationProblemDetails</c> schemas, so the SPA's generated types include them (contract §1).
/// </summary>
/// <remarks>
/// The framework's schema only knows the RFC 9457 members; extensions live in <see cref="ProblemDetails.Extensions"/>
/// and are invisible to the generator. Both are optional: framework errors (malformed JSON, unknown route) carry no
/// <c>code</c>, and the <c>traceId</c> is diagnostic, never something clients should depend on.
/// </remarks>
internal sealed class ProblemDetailsSchemaTransformer : IOpenApiSchemaTransformer
{
    /// <inheritdoc />
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);

        var type = context.JsonTypeInfo.Type;
        if (type != typeof(ProblemDetails) && type != typeof(HttpValidationProblemDetails))
        {
            return Task.CompletedTask;
        }

        schema.Properties ??= new Dictionary<string, IOpenApiSchema>(StringComparer.Ordinal);
        schema.Properties[ResultExtensions.ErrorCodeExtension] = new OpenApiSchema
        {
            Type = JsonSchemaType.String,
            Description = "Stable machine-readable error code (`<Area>.<Reason>`, e.g. `Auth.ReadOnly`). Absent on framework errors such as malformed JSON.",
        };
        schema.Properties[ProblemDetailsSetup.TraceIdExtension] = new OpenApiSchema
        {
            Type = JsonSchemaType.String,
            Description = "W3C trace context of the request (traceparent format), for correlating the error with server logs.",
        };

        return Task.CompletedTask;
    }
}
