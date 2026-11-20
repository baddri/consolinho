using System.Net;
using FleetConsole.Api.Tests.Identity;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Login outcomes that need their own host configuration (AUTH-6, AUTH-14 unavailable host), each on a variant host
/// over its own database (<see cref="ApiFactory.CreateVariantAsync"/>).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class LoginOutcomeTests(ApiFactory factory)
{
    [Fact]
    public async Task AutoProvisioningOff_UnknownUser_IsNotRegistered_PreCreatedUserLogsIn()
    {
        // AUTH-6
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?> { ["Auth:AutoProvision"] = "false" });
        var unknown = host.NewUsername();
        using var client = host.CreateBrowserClient();

        using (var callback = await host.RunLoginAsync(client, unknown, "/clusters"))
        {
            callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
            callback.Headers.Location!.OriginalString.ShouldBe($"/login?error=not_registered&username={unknown}&returnUrl=%2Fclusters");
            SessionCookieHeader(callback).ShouldBeNull();
        }

        (await host.Data.FindUserAsync(unknown)).ShouldBeNull();
        var denied = (await host.Data.AuditEntriesAsync(unknown)).ShouldHaveSingleItem();
        denied.Action.ShouldBe("auth.login_denied");
        System.Text.Json.JsonDocument.Parse(denied.DetailsJson).RootElement.GetProperty("reason").GetString().ShouldBe("notRegistered");
        denied.Actor.UserId.ShouldBeNull();
        denied.Actor.Name.ShouldBe(unknown);

        // "A pre-created user with that username logs in normally."
        var preCreated = await host.Data.UserAsync();
        using var session = await host.LoginAsAsync(preCreated.Username);
        (await GetMeAsync(session)).GetProperty("username").GetString().ShouldBe(preCreated.Username);
    }

    [Fact]
    public async Task UnreachableHost_LoginRedirectsToUnavailable_WithoutCallingOAuth()
    {
        // AUTH-14: discovery fails, so /api/auth/login never challenges.
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>(), stub => stub.Down = true);
        using var client = host.CreateBrowserClient();

        using var response = await client.GetAsync(new Uri("/api/auth/login?returnUrl=%2Fclusters", UriKind.Relative), TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        response.Headers.Location!.OriginalString.ShouldBe("/login?error=unavailable&returnUrl=%2Fclusters");
    }

    [Fact]
    public async Task HostBackAfterAnOutage_FirstLoginChallengesTheRealEndpoint()
    {
        // The first login after discovery recovers must already use the discovered endpoint (the OAuth handler of that
        // request was initialized before the endpoint loaded the metadata, see OpenShiftOAuthOptionsSetup).
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?>(),
            stub => stub.Down = true,
            new ManualClock());
        using var client = host.CreateBrowserClient();
        using (var down = await client.GetAsync(new Uri("/api/auth/login", UriKind.Relative), TestContext.Current.CancellationToken))
        {
            down.Headers.Location!.OriginalString.ShouldStartWith("/login?error=unavailable");
        }

        host.HostStub.Down = false;
        host.Clock!.Advance(TimeSpan.FromSeconds(11)); // past the provider's 10 s retry window

        using var callback = await host.RunLoginAsync(client, host.NewUsername(), "/clusters");
        callback.Headers.Location!.OriginalString.ShouldBe("/clusters");
        SessionCookieHeader(callback).ShouldNotBeNull();
    }
}
