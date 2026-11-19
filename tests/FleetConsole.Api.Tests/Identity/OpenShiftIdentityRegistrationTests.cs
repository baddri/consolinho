using System.Net;
using FleetConsole.Infrastructure.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Identity;

/// <summary>
/// Registration of the identity adapters: the "openshift-host" client has no ServiceDefaults retries (single-use OAuth
/// codes), and <see cref="OpenShiftHostOptions"/> are validated at startup.
/// </summary>
public sealed class OpenShiftIdentityRegistrationTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task HostClient_UnderServiceDefaults_SendsATokenPostExactlyOnce_EvenOn503()
    {
        var handler = new SwitchableHandler { Status = HttpStatusCode.ServiceUnavailable };
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => handler, withServiceDefaults: true);
        var client = host.Services.GetRequiredService<IHttpClientFactory>().CreateClient(OpenShiftHostHttpClient.Name);

        using var form = new FormUrlEncodedContent([new("grant_type", "authorization_code"), new("code", "fake-code")]);
        using var response = await client.PostAsync(new Uri("http://localhost/oauth/token"), form, Ct);
        using var get = await client.GetAsync(new Uri("http://localhost/.well-known/oauth-authorization-server"), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        handler.Calls.ShouldBe(2, "one attempt per request: no retries on this client");
        client.Timeout.ShouldBe(OpenShiftHostHttpClient.Timeout);
    }

    [Fact]
    public void HostClient_HasNoResilienceHandler_WhileOtherClientsDo()
    {
        // Positive control: proves the inspection would see the ServiceDefaults handler if it were there.
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), withServiceDefaults: true);
        var factory = host.Services.GetRequiredService<IHttpMessageHandlerFactory>();

        HandlerTypes(factory.CreateHandler("some-other-client")).ShouldContain(name => name.Contains("Resilience", StringComparison.Ordinal));
        HandlerTypes(factory.CreateHandler(OpenShiftHostHttpClient.Name)).ShouldNotContain(name => name.Contains("Resilience", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("Auth:OpenShift:HostApiServerUrl", null, "HostApiServerUrl is required")]
    [InlineData("Auth:OpenShift:HostApiServerUrl", "ftp://host", "HostApiServerUrl is required")]
    [InlineData("Auth:OpenShift:ClientSecret", null, "ClientSecret is required")]
    [InlineData("Auth:OpenShift:TokenEndpoint", "https://oauth.example.test/token", "must be set together")]
    [InlineData("Auth:OpenShift:CaBundlePath", "/nonexistent/fleetconsole-ca.pem", "does not exist")]
    public async Task InvalidOptions_StopStartup(string key, string? value, string expected)
    {
        var configuration = IdentityTestHost.DevConfiguration();
        configuration[key] = value;
        using var host = IdentityTestHost.Build(configuration);

        var exception = await Should.ThrowAsync<OptionsValidationException>(() => host.StartAsync(Ct));

        exception.Message.ShouldContain(expected);
        exception.Message.ShouldNotContain(DevOAuth.DevOAuthFlow.ClientSecret);
    }

    [Theory]
    [InlineData("Auth:OpenShift:HostApiServerUrl", "http://api.host.example.test:6443", "HostApiServerUrl is required and must be an absolute https URL")]
    [InlineData("Auth:OpenShift:TokenEndpoint", "http://oauth.example.test/token", "must be an absolute https URL")]
    public async Task OutsideDevelopment_PlainHttp_StopsStartup(string key, string value, string expected)
    {
        var configuration = HttpsConfiguration();
        configuration[key] = value;
        using var host = IdentityTestHost.Build(configuration, environment: "Production");

        (await Should.ThrowAsync<OptionsValidationException>(() => host.StartAsync(Ct))).Message.ShouldContain(expected);
    }

    [Fact]
    public async Task OutsideDevelopment_Https_Starts()
    {
        // Positive control for the test above (static endpoints keep the warm-up offline).
        using var host = IdentityTestHost.Build(HttpsConfiguration(), environment: "Production");

        await host.StartAsync(Ct);
        await host.StopAsync(Ct);
    }

    [Fact]
    public async Task GarbageCaBundle_StopsStartup_WithAKeyOnlyMessage()
    {
        var caFile = Path.Combine(Path.GetTempPath(), $"fleetconsole-t0014-garbage-{Guid.NewGuid():N}.pem");
        await File.WriteAllTextAsync(caFile, "this is not a certificate", Ct);
        try
        {
            var configuration = IdentityTestHost.DevConfiguration();
            configuration["Auth:OpenShift:CaBundlePath"] = caFile;
            using var host = IdentityTestHost.Build(configuration);

            var exception = await Should.ThrowAsync<OptionsValidationException>(() => host.StartAsync(Ct));

            exception.Message.ShouldContain("Auth:OpenShift:CaBundlePath contains no readable PEM certificate");
            exception.Message.ShouldNotContain("this is not a certificate");
        }
        finally
        {
            File.Delete(caFile);
        }
    }

    [Theory]
    [InlineData("Production", false)]
    [InlineData("Staging", false)]
    [InlineData("Development", true)]
    public async Task SkipTlsVerify_IsAllowedOnlyInDevelopment(string environment, bool allowed)
    {
        var configuration = IdentityTestHost.DevConfiguration();
        configuration["Auth:OpenShift:SkipTlsVerify"] = "true";
        // Static endpoints keep the warm-up from calling anything.
        configuration["Auth:OpenShift:AuthorizationEndpoint"] = "https://oauth.example.test/authorize";
        configuration["Auth:OpenShift:TokenEndpoint"] = "https://oauth.example.test/token";
        using var host = IdentityTestHost.Build(configuration, environment: environment);

        if (allowed)
        {
            await host.StartAsync(Ct);
            await host.StopAsync(Ct);
        }
        else
        {
            (await Should.ThrowAsync<OptionsValidationException>(() => host.StartAsync(Ct)))
                .Message.ShouldContain("SkipTlsVerify is only allowed in Development");
        }
    }

    private static Dictionary<string, string?> HttpsConfiguration()
    {
        var configuration = IdentityTestHost.DevConfiguration("https://api.host.example.test:6443");
        configuration["Auth:OpenShift:AuthorizationEndpoint"] = "https://oauth.example.test/authorize";
        configuration["Auth:OpenShift:TokenEndpoint"] = "https://oauth.example.test/token";
        return configuration;
    }

    private static List<string> HandlerTypes(HttpMessageHandler handler)
    {
        var names = new List<string>();
        for (HttpMessageHandler? current = handler; current is not null; current = (current as DelegatingHandler)?.InnerHandler)
        {
            names.Add(current.GetType().FullName ?? current.GetType().Name);
        }

        return names;
    }
}
