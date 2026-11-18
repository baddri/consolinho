using System.Text.Json.Serialization;

namespace FleetConsole.Api.Http;

/// <summary>
/// API-wide JSON settings for minimal API request/response bodies (and therefore for the OpenAPI schemas generated
/// from them).
/// </summary>
public static class JsonSetup
{
    /// <summary>
    /// Switches number handling to <see cref="JsonNumberHandling.Strict"/>: numbers are only read and written as JSON
    /// numbers.
    /// </summary>
    /// <remarks>
    /// ASP.NET Core's web defaults use <see cref="JsonNumberHandling.AllowReadingFromString"/>. The OpenAPI generator
    /// faithfully documents that, so every integer becomes <c>integer | string</c> in <c>/openapi/v1.json</c> and
    /// <c>number | string</c> in the SPA's generated <c>schema.gen.ts</c>. Strict handling keeps the contract precise
    /// and also rejects quoted numbers in request bodies (T-0004 review).
    /// </remarks>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddApiJson(this IServiceCollection services)
    {
        services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
        return services;
    }
}
