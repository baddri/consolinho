using System.Text.Json;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace FleetConsole.Api.OpenApi;

/// <summary>
/// Normalizes the schemas of C# enums: adds <c>"type": "string"</c> and keeps <c>null</c> out of the enum values.
/// The API serializes every enum as a camelCase string (ADR-0013 §6), and Microsoft.AspNetCore.OpenApi (.NET 10)
/// documents them as <c>{ "enum": [...] }</c> without a type; stating it makes the document self-describing for any
/// generator, not only those that infer it from the values.
/// </summary>
/// <remarks>
/// <para>When a DTO property is a nullable enum (<c>ConnectionTestStep?</c>), .NET 10 builds the shared
/// <c>#/components/schemas/&lt;Enum&gt;</c> schema from <see cref="Nullable{T}"/> and appends <c>null</c> to its
/// <c>enum</c> list, so nullability would leak into every use of the enum (generated TS type <c>"…" | null</c>, T-0047).
/// The referencing property already carries the nullability as <c>oneOf: [{ "type": "null" }, { "$ref": … }]</c>, so
/// the component is reduced to the non-null values here and nothing is lost. That wrapper is only emitted when the
/// property has a setter (.NET 10 reads its <em>write</em> nullability), so get-only DTO properties of a nullable enum
/// need a private <c>init</c> (T-0154, <c>NamespaceRulesDto.FailureKind</c>).</para>
/// <para>Only touches schemas whose non-null values are all strings, so an enum serialized differently (none today)
/// would keep its generated schema instead of being mislabelled.</para>
/// </remarks>
internal sealed class StringEnumSchemaTransformer : IOpenApiSchemaTransformer
{
    /// <inheritdoc />
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);

        var type = context.JsonTypeInfo.Type;
        var enumType = Nullable.GetUnderlyingType(type) ?? type;
        if (!enumType.IsEnum || schema.Enum is not { Count: > 0 } values)
        {
            return Task.CompletedTask;
        }

        // A null entry is either a JSON null node or a C# null in the list, depending on how the value was produced.
        var nonNull = values.Where(v => v is not null && v.GetValueKind() != JsonValueKind.Null).ToList();
        if (nonNull.Count == 0 || !nonNull.All(v => v!.GetValueKind() == JsonValueKind.String))
        {
            return Task.CompletedTask;
        }

        schema.Enum = nonNull;
        // The schema may already say ["string", "null"]; the component is the plain string enum either way.
        schema.Type = JsonSchemaType.String;

        return Task.CompletedTask;
    }
}
