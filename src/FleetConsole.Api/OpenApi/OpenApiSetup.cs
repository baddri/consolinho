using Microsoft.AspNetCore.OpenApi;

namespace FleetConsole.Api.OpenApi;

/// <summary>
/// Configures the built-in OpenAPI document (<c>/openapi/v1.json</c>), the contract the SPA's TypeScript types are
/// generated from (<c>web: npm run gen:api</c> → <c>src/shared/api/schema.gen.ts</c>).
/// </summary>
/// <remarks>
/// <para>Paths are emitted in full (<c>/api/...</c>) and the <c>servers</c> list is removed: the SPA client uses the
/// page origin as its base URL (FRONTEND.md), so a <c>/api</c> server would double the prefix, and the generator's
/// default (the requesting host, e.g. <c>http://localhost:5180/</c>) would make the document differ per environment.
/// With no servers, OpenAPI clients resolve paths against the document's own origin.</para>
/// <para>XML doc comments on endpoint handlers and DTOs are copied into the document (summaries/descriptions), so
/// write those for API consumers.</para>
/// <para>Success response schemas come from the typed results endpoints return (<c>ToHttpResult()</c>); error
/// responses are declared once on the <c>/api</c> group (see <c>ApiEndpoints</c>).</para>
/// </remarks>
public static class OpenApiSetup
{
    /// <summary>Suffix stripped from schema names: it's a C# naming convention, not part of the API contract.</summary>
    private const string DtoSuffix = "Dto";

    /// <summary>Adds OpenAPI document generation with FleetConsole's schema naming.</summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddApiOpenApi(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            // SystemInfoDto → SystemInfo, so generated TS types read naturally (components['schemas']['SystemInfo']).
            options.CreateSchemaReferenceId = typeInfo =>
            {
                var id = OpenApiOptions.CreateDefaultSchemaReferenceId(typeInfo);
                return id is { Length: > 3 } && id.EndsWith(DtoSuffix, StringComparison.Ordinal) ? id[..^DtoSuffix.Length] : id;
            };

            // Host-independent document; see remarks.
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Servers = null;
                return Task.CompletedTask;
            });
        });

        return services;
    }
}
