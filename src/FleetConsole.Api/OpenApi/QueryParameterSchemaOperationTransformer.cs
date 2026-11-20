using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace FleetConsole.Api.OpenApi;

/// <summary>
/// Endpoint metadata that documents a query parameter as <see cref="Type"/> (a <c>$ref</c> to its component schema)
/// while the handler keeps binding it as a plain string.
/// </summary>
/// <remarks>
/// Used where a parameter must be bound loosely so the validator can answer an unknown value with a field error keyed
/// by the parameter name (e.g. <c>GET /api/admin/audit?category=</c>, contract §10): binding it as the enum would turn
/// an unknown value into a bare binding 400. Added with
/// <see cref="QueryParameterSchemaExtensions.WithQueryParameterSchema{T}"/>; applied by
/// <see cref="QueryParameterSchemaOperationTransformer"/>.
/// </remarks>
/// <param name="Name">The query parameter name as published (e.g. <c>category</c>).</param>
/// <param name="Type">The type whose schema the parameter should reference (e.g. <c>AuditCategory</c>).</param>
public sealed record QueryParameterSchemaMetadata(string Name, Type Type);

/// <summary>Registers <see cref="QueryParameterSchemaMetadata"/> on endpoints.</summary>
public static class QueryParameterSchemaExtensions
{
    /// <summary>
    /// Documents the query parameter <paramref name="name"/> as <typeparamref name="T"/> in the OpenAPI document,
    /// without changing how it is bound. Server-side validation must still enforce the documented values.
    /// </summary>
    /// <typeparam name="T">The type whose schema the parameter references (an enum, typically).</typeparam>
    /// <param name="builder">The endpoint builder.</param>
    /// <param name="name">The published query parameter name.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static RouteHandlerBuilder WithQueryParameterSchema<T>(this RouteHandlerBuilder builder, string name)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrEmpty(name);

        return builder.WithMetadata(new QueryParameterSchemaMetadata(name, typeof(T)));
    }
}

/// <summary>
/// Replaces the schema of query parameters marked with <see cref="QueryParameterSchemaMetadata"/> by a reference to
/// the marked type's component schema, so generated clients see the allowed values (T-0048).
/// </summary>
/// <remarks>
/// The component is created through the document's schema pipeline (<c>GetOrCreateSchemaAsync</c>, so
/// <see cref="StringEnumSchemaTransformer"/> applies) and registered under the type's name unless a component with that
/// name is already present (it usually is, when a DTO uses the same enum). A marker naming a parameter the operation
/// does not have is a programming error and fails document generation rather than silently publishing a string.
/// </remarks>
internal sealed class QueryParameterSchemaOperationTransformer : IOpenApiOperationTransformer
{
    /// <inheritdoc />
    public async Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        ArgumentNullException.ThrowIfNull(context);

        var markers = context.Description.ActionDescriptor.EndpointMetadata.OfType<QueryParameterSchemaMetadata>().ToList();
        if (markers.Count == 0)
        {
            return;
        }

        var document = context.Document
            ?? throw new InvalidOperationException("The OpenAPI operation transformer context has no document.");

        foreach (var marker in markers)
        {
            var parameter = operation.Parameters?
                .OfType<OpenApiParameter>()
                .SingleOrDefault(p => p.In == ParameterLocation.Query && string.Equals(p.Name, marker.Name, StringComparison.Ordinal))
                ?? throw new InvalidOperationException(
                    $"Operation '{operation.OperationId}' has no query parameter '{marker.Name}' to document as {marker.Type.Name}.");

            // Enum component ids are the type name (CreateSchemaReferenceId only strips a Dto suffix, which enums lack).
            var referenceId = marker.Type.Name;
            var schema = await context.GetOrCreateSchemaAsync(marker.Type, parameterDescription: null, cancellationToken)
                .ConfigureAwait(false);
            document.AddComponent(referenceId, schema);

            parameter.Schema = new OpenApiSchemaReference(referenceId, document);
        }
    }
}
