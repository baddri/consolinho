using System.Buffers.Text;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace FleetConsole.Api.Tests.DevOAuth;

/// <summary>
/// Drives the emulator like the Api's OAuth handler and a browser would: authorize (picker form post) → code →
/// token → <c>users/~</c>. Values match the shipped dev configuration.
/// </summary>
internal static class DevOAuthFlow
{
    public const string ClientId = "fleetconsole-dev";
    public const string ClientSecret = "dev-only-not-a-secret";
    public const string RedirectUri = "http://localhost:5180/api/auth/callback";
    public const string State = "state-<&\">-123";

    public static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A fresh RFC 7636 verifier (43 chars) and its S256 challenge.</summary>
    public static (string Verifier, string Challenge) NewPkce()
    {
        var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return (verifier, challenge);
    }

    /// <summary>The authorize parameters the Api sends (scope user:info, S256 PKCE).</summary>
    public static Dictionary<string, string?> AuthorizeParameters(string challenge, string method = "S256") => new()
    {
        ["client_id"] = ClientId,
        ["redirect_uri"] = RedirectUri,
        ["response_type"] = "code",
        ["scope"] = "user:info",
        ["state"] = State,
        ["code_challenge"] = challenge,
        ["code_challenge_method"] = method,
    };

    public static Uri AuthorizeUri(Dictionary<string, string?> parameters) =>
        new(QueryHelpers.AddQueryString("/oauth/authorize", parameters), UriKind.Relative);

    /// <summary>Posts the picker form (parameters + <c>username</c> or <c>cancel=1</c>).</summary>
    public static async Task<HttpResponseMessage> PostAuthorizeAsync(
        HttpClient client, Dictionary<string, string?> parameters, string? userName = null, bool cancel = false)
    {
        var form = new Dictionary<string, string?>(parameters);
        if (userName is not null)
        {
            form["username"] = userName;
        }

        if (cancel)
        {
            form["cancel"] = "1";
        }

        using var content = new FormUrlEncodedContent(form.Select(p => new KeyValuePair<string, string>(p.Key, p.Value ?? string.Empty)));
        return await client.PostAsync(new Uri("/oauth/authorize", UriKind.Relative), content, Ct);
    }

    /// <summary>Picks <paramref name="userName"/> and returns the code from the 302 back to the client.</summary>
    public static async Task<string> GetCodeAsync(HttpClient client, Dictionary<string, string?> parameters, string userName = "alice")
    {
        using var response = await PostAuthorizeAsync(client, parameters, userName);
        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        var query = RedirectQuery(response);
        query["state"].ToString().ShouldBe(State);
        return query["code"].ToString();
    }

    /// <summary>The query of the redirect, after checking it goes to <see cref="RedirectUri"/>.</summary>
    public static Dictionary<string, Microsoft.Extensions.Primitives.StringValues> RedirectQuery(HttpResponseMessage response)
    {
        var location = response.Headers.Location.ShouldNotBeNull();
        location.GetLeftPart(UriPartial.Path).ShouldBe(RedirectUri);
        return QueryHelpers.ParseQuery(location.Query);
    }

    /// <summary>Token request with client credentials in the form body (what ASP.NET Core's OAuth handler sends).</summary>
    public static async Task<HttpResponseMessage> ExchangeAsync(
        HttpClient client,
        string code,
        string? verifier,
        string redirectUri = RedirectUri,
        string clientSecret = ClientSecret,
        string clientId = ClientId)
    {
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
        };
        if (verifier is not null)
        {
            form["code_verifier"] = verifier;
        }

        using var content = new FormUrlEncodedContent(form);
        return await client.PostAsync(new Uri("/oauth/token", UriKind.Relative), content, Ct);
    }

    public static async Task<string> GetAccessTokenAsync(HttpClient client, string userName = "alice")
    {
        var (verifier, challenge) = NewPkce();
        var code = await GetCodeAsync(client, AuthorizeParameters(challenge), userName);
        using var response = await ExchangeAsync(client, code, verifier);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return json.GetProperty("access_token").GetString().ShouldNotBeNull();
    }

    public static async Task<HttpResponseMessage> GetCurrentUserAsync(HttpClient client, string? bearer)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri("/apis/user.openshift.io/v1/users/~", UriKind.Relative));
        if (bearer is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        }

        return await client.SendAsync(request, Ct);
    }

    /// <summary>Asserts an RFC 6749 §5.2 error response.</summary>
    public static async Task ShouldBeOAuthErrorAsync(HttpResponseMessage response, string error, HttpStatusCode status = HttpStatusCode.BadRequest)
    {
        response.StatusCode.ShouldBe(status);
        response.Headers.CacheControl?.NoStore.ShouldBeTrue();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("error").GetString().ShouldBe(error);
        json.GetProperty("error_description").GetString().ShouldNotBeNullOrWhiteSpace();
    }
}
