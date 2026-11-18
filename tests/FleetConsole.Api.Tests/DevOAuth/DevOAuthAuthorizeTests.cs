using System.Net;
using static FleetConsole.Api.Tests.DevOAuth.DevOAuthFlow;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthAuthorizeTests(DevOAuthFactory factory) : IClassFixture<DevOAuthFactory>
{
    [Fact]
    public async Task GetAuthorize_RendersPicker_WithOneFormPerDevUser_AndCancel()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();

        using var response = await client.GetAsync(AuthorizeUri(AuthorizeParameters(challenge)), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("text/html");
        response.Headers.CacheControl?.NoStore.ShouldBeTrue();
        var html = await response.Content.ReadAsStringAsync(Ct);
        html.ShouldContain("FleetConsole DevOAuth — pick a user");
        html.ShouldNotContain("<script", Case.Insensitive);
        foreach (var user in new[] { "admin", "alice", "bob", "ines" })
        {
            html.ShouldContain($"name=\"username\" value=\"{user}\"");
        }

        html.ShouldContain("Fleet Admin");
        html.ShouldContain("fleetconsole-admins");
        html.ShouldContain("auditors");
        html.ShouldContain("name=\"cancel\" value=\"1\"");
        // 4 users + Cancel, each form carrying the original parameters.
        CountOf(html, "<form method=\"post\" action=\"/oauth/authorize\">").ShouldBe(5);
        CountOf(html, $"name=\"code_challenge\" value=\"{challenge}\"").ShouldBe(5);
    }

    [Fact]
    public async Task GetAuthorize_HtmlEncodesReflectedValues()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();

        using var response = await client.GetAsync(AuthorizeUri(AuthorizeParameters(challenge)), Ct);

        var html = await response.Content.ReadAsStringAsync(Ct);
        html.ShouldNotContain(State);
        html.ShouldContain("value=\"state-&lt;&amp;&quot;&gt;-123\"");
    }

    [Theory]
    [InlineData("client_id", "unknown-client")]
    [InlineData("client_id", null)]
    [InlineData("response_type", "token")]
    [InlineData("redirect_uri", "/relative/callback")]
    [InlineData("redirect_uri", "http://localhost:5180/cb#fragment")]
    [InlineData("scope", "user:everything")]
    [InlineData("code_challenge_method", "S512")]
    public async Task GetAuthorize_InvalidRequest_Returns400Page(string parameter, string? value)
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();
        var parameters = AuthorizeParameters(challenge);
        parameters[parameter] = value;

        using var response = await client.GetAsync(AuthorizeUri(parameters), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("text/html");
        (await response.Content.ReadAsStringAsync(Ct)).ShouldContain("Invalid authorization request");
    }

    [Fact]
    public async Task PostAuthorize_PickedUser_RedirectsToClientWithCodeAndState()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();

        using var response = await PostAuthorizeAsync(client, AuthorizeParameters(challenge), "alice");

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        var query = RedirectQuery(response);
        query.Keys.ShouldBe(["code", "state"], ignoreOrder: true);
        query["state"].ToString().ShouldBe(State);
        query["code"].ToString().Length.ShouldBe(43);
    }

    [Fact]
    public async Task PostAuthorize_Cancel_RedirectsWithAccessDenied()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();

        using var response = await PostAuthorizeAsync(client, AuthorizeParameters(challenge), cancel: true);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        var query = RedirectQuery(response);
        query["error"].ToString().ShouldBe("access_denied");
        query["error_description"].ToString().ShouldNotBeNullOrWhiteSpace();
        query["state"].ToString().ShouldBe(State);
        query.ContainsKey("code").ShouldBeFalse();
    }

    [Fact]
    public async Task PostAuthorize_UnknownUser_Returns400Page()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();

        using var response = await PostAuthorizeAsync(client, AuthorizeParameters(challenge), "mallory");

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        response.Headers.Location.ShouldBeNull();
    }

    [Fact]
    public async Task PostAuthorize_RevalidatesTheCarriedParameters()
    {
        using var client = factory.CreateNonRedirectingClient();
        var (_, challenge) = NewPkce();
        var parameters = AuthorizeParameters(challenge);
        parameters["client_id"] = "unknown-client";

        using var response = await PostAuthorizeAsync(client, parameters, "alice");

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        response.Headers.Location.ShouldBeNull();
    }

    private static int CountOf(string text, string value) =>
        (text.Length - text.Replace(value, string.Empty, StringComparison.Ordinal).Length) / value.Length;
}
