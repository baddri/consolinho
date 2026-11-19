using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace FleetConsole.Api.OpenApi;

/// <summary>
/// Adds <c>"type": "string"</c> to the schemas of C# enums. The API serializes every enum as a camelCase string
/// (ADR-0013 §6), and Microsoft.AspNetCore.OpenApi (.NET 10) documents them as <c>{ "enum": [...] }</c> without a type;
/// stating it makes the document self-describing for any generator, not only those that infer it from the values.
/// </summary>
/// <remarks>
/// Only touches schemas that already list string values, so an enum serialized differently (none today) would keep its
/// generated schema instead of being mislabelled.
/// </remarks>
internal sealed class StringEnumSchemaTransformer : IOpenApiSchemaTransformer
{
    /// <inheritdoc />
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);

        if (context.JsonTypeInfo.Type.IsEnum
            && schema.Type is null
            && schema.Enum is { Count: > 0 } values
            && values.All(v => v is not null && v.GetValueKind() == System.Text.Json.JsonValueKind.String))
        {
            schema.Type = JsonSchemaType.String;
        }

        return Task.CompletedTask;
    }
}
