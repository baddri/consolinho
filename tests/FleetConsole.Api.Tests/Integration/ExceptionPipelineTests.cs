using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// End-to-end checks of the error pipeline through the real host (<c>UseExceptionHandler</c> +
/// <c>GlobalExceptionHandler</c> + <c>UseStatusCodePages</c>), complementing the unit tests that call the handler on a
/// <c>DefaultHttpContext</c>. An unhandled exception is provoked by replacing <see cref="IAppEnvironment"/> (used by the
/// <c>GET /api/system/info</c> handler) with one that throws. CP0 QA, spec criteria 4 and 6.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ExceptionPipelineTests(ApiFactory factory)
{
    private const string SecretMessage = "boom Password=hunter2";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task UnhandledException_OutsideDevelopment_Returns500ProblemDetailsWithoutExceptionDetails()
    {
        await using var app = CreateHost("Production", throwing: true);
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        using var response = await client.GetAsync(new Uri("/api/system/info", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.InternalServerError);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var raw = await response.Content.ReadAsStringAsync(Ct);
        var json = JsonSerializer.Deserialize<JsonElement>(raw);
        json.GetProperty("status").GetInt32().ShouldBe(500);
        json.GetProperty("title").GetString().ShouldBe("An unexpected error occurred.");
        json.GetProperty("instance").GetString().ShouldBe("/api/system/info");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
        json.TryGetProperty("detail", out _).ShouldBeFalse();
        raw.ShouldNotContain("hunter2");
        raw.ShouldNotContain(nameof(InvalidOperationException));
        raw.ShouldNotContain("at FleetConsole.");
    }

    [Fact]
    public async Task UnhandledException_InDevelopment_IncludesExceptionDetail()
    {
        await using var app = CreateHost("Development", throwing: true);
        using var client = app.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/system/info", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.InternalServerError);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        (json.GetProperty("detail").GetString() ?? string.Empty).ShouldContain(SecretMessage);
    }

    [Theory]
    [InlineData("/api/does-not-exist", HttpStatusCode.NotFound, "GET")]
    [InlineData("/api/system/info", HttpStatusCode.MethodNotAllowed, "POST")]
    public async Task FrameworkErrors_OutsideDevelopment_AreProblemDetails(string path, HttpStatusCode expected, string method)
    {
        await using var app = CreateHost("Production", throwing: false);
        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(path, UriKind.Relative));

        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(expected);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("status").GetInt32().ShouldBe((int)expected);
        json.GetProperty("instance").GetString().ShouldBe(path);
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task OutsideDevelopment_DatabaseMigratorIsNotRegistered()
    {
        await using var app = CreateHost("Production", throwing: false);

        app.Services.GetServices<IHostedService>()
            .Select(service => service.GetType().Name)
            .ShouldNotContain("DevelopmentDatabaseMigrator");
    }

    [Fact]
    public void InDevelopment_DatabaseMigratorIsRegistered()
    {
        // Positive control for the test above, against the shared Development host.
        factory.Services.GetServices<IHostedService>()
            .Select(service => service.GetType().Name)
            .ShouldContain("DevelopmentDatabaseMigrator");
    }

    private WebApplicationFactory<Program> CreateHost(string environment, bool throwing) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            if (throwing)
            {
                builder.ConfigureTestServices(services => services.AddSingleton<IAppEnvironment, ThrowingAppEnvironment>());
            }
        });

    private sealed class ThrowingAppEnvironment : IAppEnvironment
    {
        public string Version => throw new InvalidOperationException(SecretMessage);

        public string EnvironmentName => "unused";
    }
}
