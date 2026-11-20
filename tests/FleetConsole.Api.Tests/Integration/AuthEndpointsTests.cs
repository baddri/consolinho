using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Auth;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// <c>/api/auth</c> end to end on the real host with the DevOAuth emulator as host cluster: the login flow and its
/// outcomes (AUTH-1..10, AUTH-14), <c>me</c>, logout. Revalidation (AUTH-11) is in <see cref="SessionRevalidationTests"/>,
/// configuration-dependent outcomes in <see cref="LoginOutcomeTests"/>.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AuthEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Me_WithoutSession_Returns401ProblemDetails_WithoutRedirect()
    {
        // Real-host counterpart of AuthenticationSetupTests (T-0011 review): the cookie handler answers, not a redirect.
        using var client = factory.CreateApiClient();

        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        response.Headers.Location.ShouldBeNull();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("status").GetInt32().ShouldBe(401);
        json.GetProperty("code").GetString().ShouldBe("Auth.Unauthenticated");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task Login_RedirectsToTheHostAuthorizeEndpoint_WithPkceAndTheConfiguredRedirectUri()
    {
        using var client = factory.CreateBrowserClient();

        using var response = await client.GetAsync(new Uri("/api/auth/login?returnUrl=%2Fclusters", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        var location = response.Headers.Location.ShouldNotBeNull();
        location.GetLeftPart(UriPartial.Path).ShouldBe("http://localhost/oauth/authorize");
        var query = QueryHelpers.ParseQuery(location.Query);
        query["response_type"].ToString().ShouldBe("code");
        query["client_id"].ToString().ShouldBe("fleetconsole-dev");
        query["scope"].ToString().ShouldBe("user:info");
        query["code_challenge_method"].ToString().ShouldBe("S256");
        query["code_challenge"].ToString().ShouldNotBeNullOrEmpty();
        query["state"].ToString().ShouldNotBeNullOrEmpty();
        // Console:PublicOrigin + callback path, never derived from the request.
        query["redirect_uri"].ToString().ShouldBe($"{TestHostConfiguration.PublicOrigin}/api/auth/callback");
        // The return URL travels only inside the encrypted state.
        location.Query.ShouldNotContain("clusters");
    }

    [Fact]
    public async Task FullFlow_LandsOnTheReturnUrl_WithASession()
    {
        // AUTH-1
        var username = factory.NewUsername();
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, username, "/c/prod/k8s/ns/default/pods?sort=name");

        callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.ShouldBe("/c/prod/k8s/ns/default/pods?sort=name");
        SessionCookieHeader(callback).ShouldNotBeNull();
        var me = await GetMeAsync(client);
        me.GetProperty("username").GetString().ShouldBe(username);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("javascript:alert(1)")]
    [InlineData("%2F%2Fevil.example")]
    public async Task MaliciousReturnUrls_EndOnTheStartPage(string returnUrl)
    {
        // AUTH-2: through the whole flow (sanitized at login and again at the callback).
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, factory.NewUsername(), returnUrl);

        callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.ShouldBe("/");
        SessionCookieHeader(callback).ShouldNotBeNull();
    }

    [Fact]
    public async Task AccessToken_IsInNoCookieNoTableAndNoLogLine()
    {
        // AUTH-3
        using var client = factory.CreateBrowserClient();
        var tokensBefore = factory.HostStub.IssuedAccessTokens.Count;

        using var callback = await factory.RunLoginAsync(client, factory.NewUsername(), "/");
        await GetMeAsync(client);

        factory.HostStub.IssuedAccessTokens.Count.ShouldBe(tokensBefore + 1);
        var token = factory.HostStub.IssuedAccessTokens[^1];
        token.ShouldStartWith("sha256~");

        // Cookie payload: decrypt the ticket with the app's own Data Protection and look at everything in it.
        var cookieValue = SessionCookieHeader(callback).ShouldNotBeNull().Split(';')[0][(SessionDefaults.CookieName.Length + 1)..];
        var ticket = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(SessionDefaults.Scheme).TicketDataFormat.Unprotect(cookieValue).ShouldNotBeNull();
        var serialized = TicketSerializer.Default.Serialize(ticket);
        var ticketText = string.Join('\n', ticket.Principal.Claims.Select(c => $"{c.Type}={c.Value}"))
            + '\n' + string.Join('\n', ticket.Properties.Items.Select(i => $"{i.Key}={i.Value}"));

        // Only the ADR-0009 session claims, and only our own property items, are in the ticket.
        ticket.Principal.Claims.Select(c => c.Type).Order(StringComparer.Ordinal)
            .ShouldBe([SessionClaims.UserId, SessionClaims.ReadOnly, SessionClaims.SecurityStamp, SessionClaims.Username, SessionClaims.Role], ignoreOrder: true);
        ticket.Properties.Items.Keys.Where(k => !k.StartsWith('.')).ShouldBe([SessionValidator.ValidatedAtKey]);
        // The framework's own items only: a leaked .redirect, .xsrf or code_verifier would show up here.
        ticket.Properties.Items.Keys.Where(k => k.StartsWith('.')).ShouldBeSubsetOf([".issued", ".expires", ".persistent"]);

        var setCookies = string.Join('\n', callback.Headers.GetValues("Set-Cookie"));
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        database.ShouldContain("auth.login"); // the dump is real

        TokenLeakScanner.AssertAbsent(
            token,
            ticketText,
            Encoding.UTF8.GetString(serialized),
            Encoding.Latin1.GetString(serialized),
            setCookies,
            database,
            factory.Logs.AllText);
    }

    [Fact]
    public async Task SessionCookie_HasAdr0009Attributes_SecureOverHttps_ExpiresAfterTheSessionLifetime()
    {
        // AUTH-4. Development uses SameAsRequest: Secure over https (tested here), not over plain http (dev profile).
        using var client = factory.CreateBrowserClient(new Uri("https://localhost"));

        using var callback = await factory.RunLoginAsync(client, factory.NewUsername(), "/");

        var attributes = Attributes(SessionCookieHeader(callback).ShouldNotBeNull());
        attributes.ShouldContainKey("httponly");
        attributes.ShouldContainKey("secure");
        attributes["samesite"].ShouldBe("lax");
        attributes["path"].ShouldBe("/");
        var expires = DateTimeOffset.Parse(attributes["expires"], CultureInfo.InvariantCulture);
        expires.ShouldBeInRange(DateTimeOffset.UtcNow.AddHours(8).AddMinutes(-5), DateTimeOffset.UtcNow.AddHours(8).AddMinutes(1));
    }

    [Fact]
    public async Task SessionCookie_OverPlainHttpInDevelopment_IsNotSecure()
    {
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, factory.NewUsername(), "/");

        Attributes(SessionCookieHeader(callback).ShouldNotBeNull()).ShouldNotContainKey("secure");
    }

    [Fact]
    public async Task ProvisionedUser_IsAuditedAndRecorded()
    {
        // AUTH-5 (auto-provisioning is on in the Development configuration).
        var username = factory.NewUsername();

        using var client = await factory.LoginAsAsync(username);

        var user = (await factory.Data.FindUserAsync(username)).ShouldNotBeNull();
        user.Role.ShouldBe(UserRole.User);
        user.IsReadOnly.ShouldBeFalse();
        user.IsDeactivated.ShouldBeFalse();
        user.LastLoginAt.ShouldNotBeNull();
        user.DisplayName.ShouldBe(TestOAuthServer.FullNameOf(username));
        user.Groups.ShouldBeEmpty(); // the emulator's virtual system:* groups are dropped

        var entries = await factory.Data.AuditEntriesAsync(username);
        entries.Select(e => e.Action).ShouldBe(["user.provisioned", "auth.login"], ignoreOrder: true);
        entries.ShouldAllBe(e => e.Actor.Name == username && e.Actor.UserId == user.Id);
    }

    [Fact]
    public async Task AdminGroupMember_BecomesAdminByConfiguration_AuditedAsSystemConfig()
    {
        // AUTH-8 (dev configuration: Auth:AdminGroups = [fleetconsole-admins]) and AUTH-9 shape for an admin.
        var username = factory.NewAdminUsername();

        using var client = await factory.LoginAsAsync(username);

        var me = await GetMeAsync(client);
        me.GetProperty("username").GetString().ShouldBe(username);
        me.GetProperty("displayName").GetString().ShouldBe(TestOAuthServer.FullNameOf(username));
        me.GetProperty("role").GetString().ShouldBe("admin");
        me.GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();
        me.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldBe([TestOAuthServer.AdminGroup]);
        me.GetProperty("isAdminViaConfiguration").GetBoolean().ShouldBeTrue();
        me.GetProperty("adminConfigurationSource").GetString().ShouldBe($"group {TestOAuthServer.AdminGroup}");

        var entries = await factory.Data.AuditEntriesAsync(username);
        entries.Select(e => e.Action).ShouldBe(["user.provisioned", "user.promoted", "auth.login"], ignoreOrder: true);
        var promoted = entries.Single(e => e.Action == "user.promoted");
        promoted.Actor.Name.ShouldBe("system (config)");
        promoted.Actor.IsSystem.ShouldBeTrue();
    }

    [Fact]
    public async Task Me_ForAUserWithoutFullNameOrGroups_HasNullDisplayNameAndEmptyGroups()
    {
        // AUTH-9 shape; nullable fields are present with null (contract §1). bob is a shipped emulator user.
        using var client = await factory.LoginAsAsync("bob");

        var me = await GetMeAsync(client);

        me.EnumerateObject().Select(p => p.Name).ShouldBe(
            ["username", "displayName", "role", "isReadOnly", "groups", "isAdminViaConfiguration", "adminConfigurationSource"],
            ignoreOrder: true);
        me.GetProperty("displayName").ValueKind.ShouldBe(JsonValueKind.Null);
        me.GetProperty("role").GetString().ShouldBe("user");
        me.GetProperty("groups").GetArrayLength().ShouldBe(0);
        me.GetProperty("isAdminViaConfiguration").GetBoolean().ShouldBeFalse();
        me.GetProperty("adminConfigurationSource").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task DeactivatedUser_IsRefused_WithoutSession_AndAudited()
    {
        // AUTH-7
        var user = await factory.Data.UserAsync(deactivated: true);
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, user.Username, "/clusters");

        callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.ShouldBe("/login?error=deactivated&returnUrl=%2Fclusters");
        SessionCookieHeader(callback).ShouldBeNull();
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized);

        var denied = (await factory.Data.AuditEntriesAsync(user.Username)).Single(e => e.Action == "auth.login_denied");
        System.Text.Json.JsonDocument.Parse(denied.DetailsJson).RootElement.GetProperty("reason").GetString().ShouldBe("deactivated");
        denied.Actor.Name.ShouldBe(user.Username);
    }

    [Fact]
    public async Task Cancel_OnTheOpenShiftLoginPage_EndsOnLoginWithCancelled()
    {
        // AUTH-14
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, username: null, "/clusters", cancel: true);

        callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.ShouldBe("/login?error=cancelled&returnUrl=%2Fclusters");
        SessionCookieHeader(callback).ShouldBeNull();
    }

    [Fact]
    public async Task UsersEndpointFailure_EndsOnLoginWithUnavailable_AndIsLoggedWithTraceId()
    {
        // AUTH-14: the code exchange works, users/~ answers 503.
        using var client = factory.CreateBrowserClient();
        factory.HostStub.UsersEndpointStatus = HttpStatusCode.ServiceUnavailable;
        HttpResponseMessage callback;
        try
        {
            callback = await factory.RunLoginAsync(client, factory.NewUsername(), "/clusters");
        }
        finally
        {
            factory.HostStub.UsersEndpointStatus = null;
        }

        using (callback)
        {
            callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
            callback.Headers.Location!.OriginalString.ShouldBe("/login?error=unavailable&returnUrl=%2Fclusters");
            SessionCookieHeader(callback).ShouldBeNull();
        }

        factory.Logs.Entries.ShouldContain(e => e.EventId == 2200
            && e.Text.Contains("outcome unavailable", StringComparison.Ordinal)
            && e.Text.Contains("ExternalIdentityUnavailableException", StringComparison.Ordinal)
            && e.Text.Contains("TraceId=00-", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Login_WhenAlreadySignedIn_GoesStraightToTheReturnUrl()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());

        using var response = await client.GetAsync(new Uri("/api/auth/login?returnUrl=%2Fadmin%2Fusers", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        response.Headers.Location!.OriginalString.ShouldBe("/admin/users");
    }

    [Fact]
    public async Task Logout_ClearsTheSession_Returns204_AndIsAudited()
    {
        // AUTH-10
        var username = factory.NewUsername();
        using var client = await factory.LoginAsAsync(username);

        using var response = await client.PostAsync(new Uri("/api/auth/logout", UriKind.Relative), null, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var cleared = SessionCookieHeader(response).ShouldNotBeNull();
        DateTimeOffset.Parse(Attributes(cleared)["expires"], CultureInfo.InvariantCulture).ShouldBeLessThan(DateTimeOffset.UtcNow);
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized);
        (await factory.Data.AuditEntriesAsync(username)).Count(e => e.Action == "auth.logout").ShouldBe(1);
    }

    [Fact]
    public async Task Logout_WithoutCsrfHeader_Returns403_AndKeepsTheSession()
    {
        // AUTH-10 / AUTH-13
        using var client = await factory.LoginAsAsync(factory.NewUsername());
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/api/auth/logout", UriKind.Relative));
        request.Headers.Remove("X-Console-Request");
        client.DefaultRequestHeaders.Remove("X-Console-Request");

        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetString().ShouldBe("Auth.CsrfHeaderMissing");
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Logout_WithoutSession_Returns204()
    {
        using var client = factory.CreateBrowserClient();

        using var response = await client.PostAsync(new Uri("/api/auth/logout", UriKind.Relative), null, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    internal static string? SessionCookieHeader(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.SingleOrDefault(v => v.StartsWith(SessionDefaults.CookieName + "=", StringComparison.Ordinal))
            : null;

    internal static Dictionary<string, string> Attributes(string setCookie) =>
        setCookie.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Skip(1)
            .Select(a => a.Split('=', 2))
            .ToDictionary(a => a[0].ToLowerInvariant(), a => a.Length > 1 ? a[1].ToLowerInvariant() : string.Empty);

    internal static async Task<JsonElement> GetMeAsync(HttpClient client)
    {
        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }
}
