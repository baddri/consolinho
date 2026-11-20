using System.Net;
using Microsoft.AspNetCore.WebUtilities;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// The failure branches of the callback that FleetConsole owns rather than the framework (ADR-0018), through HTTP: the
/// re-implemented token exchange (<c>OpenShiftOAuthHandler.ExchangeCodeAsync</c>) and OAuth error redirects with
/// remote text. Every case must end on <c>/login?error=…&amp;returnUrl=%2Fclusters</c> without a session, and no
/// remote text (response body, <c>error_description</c>, <c>error_uri</c>) may reach the logs (AUTH-14, SECURITY.md).
/// </summary>
/// <remarks>Switches are set on the shared host's <see cref="OpenShiftHostStub"/> and reset after each test.</remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TokenExchangeFailureTests(ApiFactory factory) : IDisposable
{
    private const string RequestLineCategory = "Microsoft.AspNetCore.Hosting.Diagnostics |";

    private readonly string _marker = $"remote-marker-{TestData.Unique()}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => factory.HostStub.Reset();

    [Fact]
    public async Task TokenEndpoint503_IsUnavailable()
    {
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.ServiceUnavailable;
        factory.HostStub.TokenEndpointBody = $"<html>{_marker} upstream down</html>";

        await ShouldEndOnLoginAsync("unavailable", "OAuthServerUnavailableException");
    }

    [Fact]
    public async Task TokenEndpoint429_IsUnavailable()
    {
        // Rate limited: a server condition, the user should try again later (engineer's call, review round 1).
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.TooManyRequests;
        factory.HostStub.TokenEndpointBody = $"{{\"error\":\"{_marker}\"}}";

        await ShouldEndOnLoginAsync("unavailable", "OAuthServerUnavailableException");
    }

    [Fact]
    public async Task TokenEndpointInvalidGrant_IsFailed()
    {
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.BadRequest;
        factory.HostStub.TokenEndpointBody = $"{{\"error\":\"invalid_grant\",\"error_description\":\"{_marker}\"}}";

        await ShouldEndOnLoginAsync("failed", "AuthenticationFailureException");
    }

    [Fact]
    public async Task TokenEndpointNonJsonBody_IsFailed()
    {
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.OK;
        factory.HostStub.TokenEndpointBody = $"not json {_marker}";

        await ShouldEndOnLoginAsync("failed", "AuthenticationFailureException");
    }

    [Theory]
    [InlineData("[\"{0}\"]")]
    [InlineData("\"{0}\"")]
    public async Task TokenEndpointJsonThatIsNotAnObject_IsFailed(string bodyFormat)
    {
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.OK;
        factory.HostStub.TokenEndpointBody = string.Format(System.Globalization.CultureInfo.InvariantCulture, bodyFormat, _marker);

        await ShouldEndOnLoginAsync("failed", "AuthenticationFailureException");
    }

    [Fact]
    public async Task TokenEndpointWithoutAccessToken_IsFailed()
    {
        factory.HostStub.TokenEndpointStatus = HttpStatusCode.OK;
        factory.HostStub.TokenEndpointBody = $"{{\"token_type\":\"Bearer\",\"scope\":\"{_marker}\"}}";

        await ShouldEndOnLoginAsync("failed", "AuthenticationFailureException");
    }

    [Fact]
    public async Task TokenEndpointUnreachable_IsUnavailable_AndKeepsTheReturnUrl()
    {
        // The exception path: the framework reports it without the state's properties, so the return URL survives only
        // because the handler remembered it (OpenShiftLoginEvents.RememberReturnUrl).
        factory.HostStub.TokenEndpointDown = true;

        await ShouldEndOnLoginAsync("unavailable", "OAuthServerUnavailableException");
    }

    [Theory]
    [InlineData("access_denied", "cancelled")]
    [InlineData("server_error", "unavailable")]
    [InlineData("invalid_request", "failed")]
    public async Task OAuthErrorRedirect_WithRemoteText_EndsOnLogin_WithoutLoggingTheText(string error, string expected)
    {
        // A crafted callback with a valid state and correlation cookie, as the OAuth server (or anyone steering the
        // browser) could send. ASP.NET Core logs "error;Description=…;Uri=…" at Information; the handler's loggers are
        // limited to Warning (WarningOnlyLoggerFactory), so that text must not appear.
        using var client = factory.CreateBrowserClient();
        using var login = await client.GetAsync(new Uri("/api/auth/login?returnUrl=%2Fclusters", UriKind.Relative), Ct);
        var state = QueryHelpers.ParseQuery(login.Headers.Location.ShouldNotBeNull().Query)["state"].ToString();
        var callback = QueryHelpers.AddQueryString("/api/auth/callback", new Dictionary<string, string?>
        {
            ["state"] = state,
            ["error"] = error,
            ["error_description"] = $"{_marker} description",
            ["error_uri"] = $"https://evil.example/{_marker}",
        });

        using var response = await client.GetAsync(new Uri(callback, UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        response.Headers.Location!.OriginalString.ShouldBe($"/login?error={expected}&returnUrl=%2Fclusters");
        SessionCookieHeader(response).ShouldBeNull();
        // Excluded: ASP.NET Core's request-line log, which quotes the URL this test crafted. It is Information under
        // Microsoft.AspNetCore, filtered to Warning by appsettings.json (see the T-0015 handover notes).
        factory.Logs.Entries
            .Where(e => !e.Text.StartsWith(RequestLineCategory, StringComparison.Ordinal))
            .ShouldNotContain(e => e.Text.Contains(_marker, StringComparison.Ordinal));
        factory.Logs.Entries.ShouldContain(e => e.EventId == 2200 && e.Text.Contains($"outcome {expected}", StringComparison.Ordinal));
    }

    private async Task ShouldEndOnLoginAsync(string expectedError, string expectedCause)
    {
        using var client = factory.CreateBrowserClient();

        using var callback = await factory.RunLoginAsync(client, factory.NewUsername(), "/clusters");

        callback.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.ShouldBe($"/login?error={expectedError}&returnUrl=%2Fclusters");
        SessionCookieHeader(callback).ShouldBeNull();
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized);

        factory.Logs.Entries.ShouldContain(e => e.EventId == 2200
            && e.Text.Contains($"outcome {expectedError}", StringComparison.Ordinal)
            && e.Text.Contains(expectedCause, StringComparison.Ordinal));
        factory.Logs.AllText.ShouldNotContain(_marker);
        if (factory.HostStub.TokenEndpointBody.Length > 0)
        {
            factory.Logs.AllText.ShouldNotContain(factory.HostStub.TokenEndpointBody);
        }
    }
}
