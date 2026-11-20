using System.Text.Json;
using System.Text.Json.Serialization;

namespace FleetConsole.Api.Http;

/// <summary>
/// API-wide JSON settings for minimal API request/response bodies (and therefore for the OpenAPI schemas generated
/// from them).
/// </summary>
public static class JsonSetup
{
    /// <summary>
    /// Applies the API's JSON conventions on top of ASP.NET Core's web defaults (camelCase properties):
    /// <see cref="JsonNumberHandling.Strict"/> numbers and enums as camelCase strings.
    /// </summary>
    /// <remarks>
    /// <para><b>Strict numbers:</b> ASP.NET Core's web defaults use <see cref="JsonNumberHandling.AllowReadingFromString"/>.
    /// The OpenAPI generator faithfully documents that, so every integer becomes <c>integer | string</c> in
    /// <c>/openapi/v1.json</c> and <c>number | string</c> in the SPA's generated <c>schema.gen.ts</c>. Strict handling
    /// keeps the contract precise and also rejects quoted numbers in request bodies (T-0004 review).</para>
    /// <para><b>Enums</b> (ADR-0013 §6): written and read as camelCase strings (<c>UserRole.Admin</c> → <c>"admin"</c>,
    /// <c>AccessMode.ReadOnly</c> → <c>"readOnly"</c>), so the contract is readable and reordering enum members can't
    /// change it. Integer values are refused (<c>allowIntegerValues: false</c>): an unknown or numeric enum value in a
    /// request body is a 400. The OpenAPI document picks the converter up and documents string enums.</para>
    /// </remarks>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddApiJson(this IServiceCollection services)
    {
        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
        });
        return services;
    }
}
