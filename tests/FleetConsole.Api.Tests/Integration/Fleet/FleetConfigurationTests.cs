using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Hosting;
using FleetConsole.Application.Fleet;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Integration.Fleet;

/// <summary>
/// The fleet endpoint's host wiring: <c>Fleet:*</c> is validated on start (a bad bound stops the host, ADR-0028 §6) and
/// the OpenAPI document publishes the NDJSON line schema the SPA's types are generated from (contract §2).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class FleetConfigurationTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("Fleet:MaxClusterConcurrency", "0")]
    [InlineData("Fleet:ClusterTimeout", "00:00:31")]
    [InlineData("Fleet:CacheDuration", "00:00:00")]
    [InlineData("Fleet:MaxConcurrentRequests", "257")]
    [InlineData("Fleet:RequestQueueLimit", "-1")]
    public async Task OutOfRangeSetting_FailsStartValidation(string key, string value)
    {
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?> { [key] = value });

        var exception = Should.Throw<OptionsValidationException>(() => RunStartValidation(host));

        exception.Failures.ShouldBe([FleetOptions.InvalidMessage]);
    }

    [Fact]
    public async Task OpenApi_Publishes_TheNdjsonLineSchema_WithCamelCaseStringEnums()
    {
        using var client = factory.CreateApiClient();
        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var document = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

        var operation = document.GetProperty("paths").GetProperty("/api/fleet/status").GetProperty("get");
        operation.GetProperty("operationId").GetString().ShouldBe("GetFleetStatus");
        operation.GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ShouldBe(["Fleet"]);
        var ok = operation.GetProperty("responses").GetProperty("200").GetProperty("content");
        ok.EnumerateObject().Select(p => p.Name).ShouldBe(["application/x-ndjson"]);
        ok.GetProperty("application/x-ndjson").GetProperty("schema").GetProperty("$ref").GetString()
            .ShouldBe("#/components/schemas/FleetClusterStatus");
        operation.GetProperty("responses").TryGetProperty("503", out _).ShouldBeTrue();

        var schemas = document.GetProperty("components").GetProperty("schemas");
        EnumValues(schemas, "FleetClusterFailure")
            .ShouldBe(["unreachable", "timeout", "tlsError", "tokenInvalid", "upstreamError", "blockedByPolicy"], ignoreOrder: true);
        EnumValues(schemas, "FleetProbeOutcome").ShouldBe(["ok", "forbidden", "notFound"], ignoreOrder: true);
    }

    private static IEnumerable<string?> EnumValues(JsonElement schemas, string name)
    {
        var schema = schemas.GetProperty(name);
        schema.GetProperty("type").GetString().ShouldBe("string");
        return schema.GetProperty("enum").EnumerateArray().Select(v => v.GetString());
    }

    // Runs the host's start-time options validation without starting it (same approach as ProductionConfigurationTests).
    private static void RunStartValidation(ProductionHost host)
    {
        ServiceDescriptor? startupValidator = null;
        using var withoutValidation = host.Factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            startupValidator = services.SingleOrDefault(d => d.ServiceType == typeof(IStartupValidator));
            services.RemoveAll<IStartupValidator>();
        }));

        var services = withoutValidation.Services;
        var implementationType = startupValidator.ShouldNotBeNull().ImplementationType.ShouldNotBeNull();
        ((IStartupValidator)ActivatorUtilities.CreateInstance(services, implementationType)).Validate();
    }
}
