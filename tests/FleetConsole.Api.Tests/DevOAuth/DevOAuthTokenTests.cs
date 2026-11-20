using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using static FleetConsole.Api.Tests.DevOAuth.DevOAuthFlow;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthTokenTests(DevOAuthFactory factory) : IClassFixture<DevOAuthFactory>
{
    [Fact]
    public async Task FullCodeFlow_WithS256Pkce_IssuesOpenShiftStyleToken_AndUsersTildeIdentifiesTheUser()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge), "alice");

        using var tokenResponse = await ExchangeAsync(client, code, verifier);

        tokenResponse.StatusCode.ShouldBe(HttpStatusCode.OK);
        tokenResponse.Headers.CacheControl?.NoStore.ShouldBeTrue();
        var token = await tokenResponse.Content.ReadFromJsonAsync<JsonElement>(Ct);
        token.EnumerateObject().Select(p => p.Name).ShouldBe(["access_token", "token_type", "expires_in", "scope"], ignoreOrder: true);
        var accessToken = token.GetProperty("access_token").GetString().ShouldNotBeNull();
        accessToken.ShouldMatch("^sha256~[A-Za-z0-9_-]{43}$");
        token.GetProperty("token_type").GetString().ShouldBe("Bearer");
        token.GetProperty("expires_in").GetInt64().ShouldBe(86400);
        token.GetProperty("scope").GetString().ShouldBe("user:info");

        using var userResponse = await GetCurrentUserAsync(client, accessToken);

        userResponse.StatusCode.ShouldBe(HttpStatusCode.OK);
        var user = await userResponse.Content.ReadFromJsonAsync<JsonElement>(Ct);
        user.GetProperty("kind").GetString().ShouldBe("User");
        user.GetProperty("apiVersion").GetString().ShouldBe("user.openshift.io/v1");
        user.GetProperty("metadata").GetProperty("name").GetString().ShouldBe("alice");
        Guid.TryParse(user.GetProperty("metadata").GetProperty("uid").GetString(), out _).ShouldBeTrue();
        user.GetProperty("fullName").GetString().ShouldBe("Alice Example");
        user.GetProperty("identities").EnumerateArray().Select(e => e.GetString()).ShouldBe(["devoauth:alice"]);
        // Like a real cluster: the user's groups plus the virtual groups of OAuth-authenticated users, sorted.
        user.GetProperty("groups").EnumerateArray().Select(e => e.GetString())
            .ShouldBe(["sre", "system:authenticated", "system:authenticated:oauth"]);
    }

    [Fact]
    public async Task Token_WithHttpBasicClientAuthentication_Succeeds()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/oauth/token", UriKind.Relative))
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = RedirectUri,
                ["code_verifier"] = verifier,
            }),
        };
        request.Headers.Authorization = BasicCredentials(ClientId, ClientSecret);

        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Token_WithPlainPkce_Succeeds()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, _) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(verifier, method: "plain"));

        using var response = await ExchangeAsync(client, code, verifier);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Token_ReusedCode_IsInvalidGrant()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));
        using var first = await ExchangeAsync(client, code, verifier);
        first.StatusCode.ShouldBe(HttpStatusCode.OK);

        using var second = await ExchangeAsync(client, code, verifier);

        await ShouldBeOAuthErrorAsync(second, "invalid_grant");
    }

    [Fact]
    public async Task Token_ExpiredCode_IsInvalidGrant()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));
        factory.Time.Advance(TimeSpan.FromSeconds(60));

        using var response = await ExchangeAsync(client, code, verifier);

        await ShouldBeOAuthErrorAsync(response, "invalid_grant");
    }

    [Fact]
    public async Task Token_WrongVerifier_IsInvalidGrant_AndConsumesTheCode()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var (otherVerifier, _) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));

        using var wrong = await ExchangeAsync(client, code, otherVerifier);
        using var retry = await ExchangeAsync(client, code, verifier);

        await ShouldBeOAuthErrorAsync(wrong, "invalid_grant");
        await ShouldBeOAuthErrorAsync(retry, "invalid_grant");
    }

    [Fact]
    public async Task Token_MissingVerifier_WhenChallengeWasSent_IsInvalidRequest()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));

        using var response = await ExchangeAsync(client, code, verifier: null);

        await ShouldBeOAuthErrorAsync(response, "invalid_request");
    }

    [Fact]
    public async Task Token_WrongRedirectUri_IsInvalidGrant()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));

        using var response = await ExchangeAsync(client, code, verifier, redirectUri: "http://localhost:5180/api/auth/other");

        await ShouldBeOAuthErrorAsync(response, "invalid_grant");
    }

    [Theory]
    [InlineData(ClientId, "wrong-secret")]
    [InlineData(ClientId, "")]
    [InlineData("unknown-client", ClientSecret)]
    public async Task Token_BadClientCredentials_IsInvalidClient(string clientId, string clientSecret)
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge));

        using var response = await ExchangeAsync(client, code, verifier, clientId: clientId, clientSecret: clientSecret);

        await ShouldBeOAuthErrorAsync(response, "invalid_client");
    }

    [Fact]
    public async Task Token_BadHttpBasicCredentials_Is401InvalidClient_WithChallenge()
    {
        using var client = factory.CreateNonRedirectingClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/oauth/token", UriKind.Relative))
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "authorization_code", ["code"] = "x" }),
        };
        request.Headers.Authorization = BasicCredentials(ClientId, "wrong-secret");

        using var response = await client.SendAsync(request, Ct);

        await ShouldBeOAuthErrorAsync(response, "invalid_client", HttpStatusCode.Unauthorized);
        response.Headers.WwwAuthenticate.Select(h => h.Scheme).ShouldBe(["Basic"]);
    }

    [Fact]
    public async Task Token_UnknownCode_IsInvalidGrant()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (verifier, _) = NewPkce();

        using var response = await ExchangeAsync(client, "not-a-code", verifier);

        await ShouldBeOAuthErrorAsync(response, "invalid_grant");
    }

    [Fact]
    public async Task Token_UnsupportedGrantType_IsRejected()
    {
        using var client = factory.CreateNonRedirectingClient();
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "password",
            ["client_id"] = ClientId,
            ["client_secret"] = ClientSecret,
        });

        using var response = await client.PostAsync(new Uri("/oauth/token", UriKind.Relative), content, Ct);

        await ShouldBeOAuthErrorAsync(response, "unsupported_grant_type");
    }

    private static AuthenticationHeaderValue BasicCredentials(string clientId, string clientSecret) =>
        new("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.EscapeDataString(clientId)}:{Uri.EscapeDataString(clientSecret)}")));
}
