using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Domain.Users;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// AUTH-11 / ADR-0009 through HTTP: with <c>Auth:RevalidationInterval=00:00:00</c> every request re-reads the user, so
/// changes made below HTTP (<see cref="TestData"/>) are visible on the next call. One variant host for the class.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SessionRevalidationTests(ApiFactory factory) : IAsyncLifetime
{
    private ApiFactory _host = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() =>
        _host = await factory.CreateVariantAsync(new Dictionary<string, string?> { ["Auth:RevalidationInterval"] = "00:00:00" });

    public async ValueTask DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task DeactivatedUser_NextCallIs401_AndTheCookieIsCleared()
    {
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);
        (await MeStatusAsync(client)).ShouldBe(HttpStatusCode.OK);

        await _host.Data.DeactivateAsync(user.Username);

        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetString().ShouldBe("Auth.Unauthenticated");
        var cleared = SessionCookieHeader(response).ShouldNotBeNull();
        DateTimeOffset.Parse(Attributes(cleared)["expires"], System.Globalization.CultureInfo.InvariantCulture)
            .ShouldBeLessThan(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task RoleAndReadOnlyChanges_AreReflectedWithoutReLogin()
    {
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);
        var before = await GetMeAsync(client);
        before.GetProperty("role").GetString().ShouldBe("user");
        before.GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();

        // Read-only first: a writable admin would be the variant's only one and couldn't be made read-only (ADM-5).
        await _host.Data.SetReadOnlyAsync(user.Username, isReadOnly: true);
        await _host.Data.SetRoleAsync(user.Username, UserRole.Admin);

        var after = await GetMeAsync(client);
        after.GetProperty("role").GetString().ShouldBe("admin");
        after.GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task DeactivateThenReactivate_DoesNotReviveTheOldSession()
    {
        // The stamp rotated by Deactivate is not restored by Reactivate (ADR-0009); no request in between.
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);

        await _host.Data.DeactivateAsync(user.Username);
        await _host.Data.ReactivateAsync(user.Username);

        (await MeStatusAsync(client)).ShouldBe(HttpStatusCode.Unauthorized);
        using var again = await _host.LoginAsAsync(user.Username); // a fresh login works
        (await MeStatusAsync(again)).ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task EachRevalidation_RenewsTheCookie()
    {
        // Sliding expiration (AUTH-4): a refreshed session is re-issued with a new expiry.
        using var client = await _host.LoginAsAsync(_host.NewUsername());

        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var renewed = SessionCookieHeader(response).ShouldNotBeNull();
        DateTimeOffset.Parse(Attributes(renewed)["expires"], System.Globalization.CultureInfo.InvariantCulture)
            .ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddHours(7));
    }

    [Fact]
    public async Task WithTheDefaultInterval_ChangesWaitForTheNextCheck()
    {
        // Counterpart on the default host (60 s): the session keeps its claims until revalidation is due.
        var user = await factory.Data.UserAsync();
        using var client = await factory.LoginAsAsync(user.Username);

        await factory.Data.SetRoleAsync(user.Username, UserRole.Admin);

        (await GetMeAsync(client)).GetProperty("role").GetString().ShouldBe("user");
    }
}
