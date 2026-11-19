using FleetConsole.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Auth;

/// <summary><c>Console:PublicOrigin</c> (ADR-0010, contract §12): an origin, required outside Development.</summary>
public sealed class PublicOriginOptionsTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("https://fleetconsole.example.com", "https://fleetconsole.example.com")]
    [InlineData("https://fleetconsole.example.com/", "https://fleetconsole.example.com")]
    [InlineData("http://localhost:5173", "http://localhost:5173")]
    [InlineData("HTTPS://FleetConsole.Example.COM:443", "https://fleetconsole.example.com")]
    public void ValidOrigins_AreNormalized(string value, string expected) =>
        new PublicOriginOptions { PublicOrigin = value }.GetOrigin().ShouldBe(expected);

    [Theory]
    [InlineData("")]
    [InlineData("fleetconsole.example.com")]
    [InlineData("/relative")]
    [InlineData("ftp://fleetconsole.example.com")]
    [InlineData("https://fleetconsole.example.com/console")]
    [InlineData("https://fleetconsole.example.com?x=1")]
    [InlineData("https://fleetconsole.example.com/?")]
    [InlineData("https://fleetconsole.example.com#top")]
    [InlineData("https://user:pw@fleetconsole.example.com")]
    public void InvalidOrigins_FailValidation(string value)
    {
        var result = new PublicOriginOptionsValidator().Validate(null, new PublicOriginOptions { PublicOrigin = value });

        result.Failed.ShouldBeTrue();
        result.FailureMessage.ShouldContain("Console:PublicOrigin");
        if (value.Length > 0)
        {
            result.FailureMessage.ShouldNotContain(value);
        }
    }

    [Fact]
    public async Task Missing_FailsStartupOutsideDevelopment()
    {
        await Should.ThrowAsync<OptionsValidationException>(async () =>
        {
            await using var app = await StartAsync(Environments.Production, origin: null);
        });
    }

    [Fact]
    public async Task Missing_InDevelopment_DefaultsToTheApiLaunchProfile()
    {
        await using var app = await StartAsync(Environments.Development, origin: null);

        app.Services.GetRequiredService<IOptions<PublicOriginOptions>>().Value.GetOrigin().ShouldBe("http://localhost:5180");
    }

    [Fact]
    public async Task Configured_IsUsedInAnyEnvironment()
    {
        await using var app = await StartAsync(Environments.Production, origin: "https://fleetconsole.example.com");

        app.Services.GetRequiredService<IOptions<PublicOriginOptions>>().Value.GetOrigin().ShouldBe("https://fleetconsole.example.com");
    }

    private static async Task<WebApplication> StartAsync(string environment, string? origin)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Console:PublicOrigin"] = origin });
        builder.AddPublicOrigin();

        var app = builder.Build();
        try
        {
            await app.StartAsync(Ct);
        }
        catch
        {
            await app.DisposeAsync();
            throw;
        }

        return app;
    }
}
