using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Auth;

/// <summary>
/// The cookie scheme and policies from <see cref="AuthenticationSetup"/> on a minimal in-memory host (no database):
/// API-friendly 401/403 ProblemDetails, cookie attributes (ADR-0009), the Admin policy, option validation, against test
/// endpoints. Revalidation never becomes due here (sign-in marks the session validated; default interval), so no
/// dispatcher is needed. The real host's behaviour is covered by the integration tests (<c>AuthEndpointsTests</c>).
/// </summary>
public sealed class AuthenticationSetupTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ProtectedEndpoint_WithoutSession_Returns401ProblemDetailsInsteadOfRedirect()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();

        using var response = await client.GetAsync(new Uri("/protected", UriKind.Relative), Ct);

        await ShouldBeProblemAsync(response, HttpStatusCode.Unauthorized, "Auth.Unauthenticated", "Authentication required.");
        response.Headers.Location.ShouldBeNull();
    }

    [Fact]
    public async Task AdminEndpoint_WithoutSession_Returns401()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();

        using var response = await client.GetAsync(new Uri("/admin", UriKind.Relative), Ct);

        await ShouldBeProblemAsync(response, HttpStatusCode.Unauthorized, "Auth.Unauthenticated", "Authentication required.");
    }

    [Fact]
    public async Task AdminEndpoint_AsUser_Returns403ProblemDetailsInsteadOfRedirect()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        var cookie = await SignInAsync(client, UserRole.User);

        using var response = await SendWithCookieAsync(client, "/admin", cookie);

        await ShouldBeProblemAsync(response, HttpStatusCode.Forbidden, "Auth.Forbidden", "You don't have access to Fleet administration.");
        response.Headers.Location.ShouldBeNull();
    }

    [Theory]
    [InlineData(UserRole.User, "/protected")]
    [InlineData(UserRole.Admin, "/protected")]
    [InlineData(UserRole.Admin, "/admin")]
    public async Task AuthorizedSession_ReachesEndpoint(UserRole role, string path)
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        var cookie = await SignInAsync(client, role);

        using var response = await SendWithCookieAsync(client, path, cookie);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task SessionCookie_HasAdr0009Attributes_OutsideDevelopment()
    {
        await using var app = await StartAsync(Environments.Production);
        using var client = app.GetTestClient();

        using var response = await client.PostAsync(new Uri("/sign-in?role=user", UriKind.Relative), null, Ct);

        var setCookie = response.Headers.GetValues("Set-Cookie").Single(h => h.StartsWith(SessionDefaults.CookieName + "=", StringComparison.Ordinal));
        var attributes = setCookie.Split(';', StringSplitOptions.TrimEntries).Skip(1).Select(a => a.ToLowerInvariant()).ToArray();
        attributes.ShouldContain("httponly");
        attributes.ShouldContain("samesite=lax");
        attributes.ShouldContain("secure");
        attributes.ShouldContain("path=/");
    }

    [Fact]
    public async Task SessionCookie_InDevelopmentOverHttp_IsNotSecure()
    {
        // The plain-http dev profile needs SecurePolicy=SameAsRequest; TestServer requests are http.
        await using var app = await StartAsync(Environments.Development);
        using var client = app.GetTestClient();

        using var response = await client.PostAsync(new Uri("/sign-in?role=user", UriKind.Relative), null, Ct);

        var setCookie = response.Headers.GetValues("Set-Cookie").Single(h => h.StartsWith(SessionDefaults.CookieName + "=", StringComparison.Ordinal));
        setCookie.ToLowerInvariant().ShouldNotContain("secure");
    }

    [Fact]
    public async Task CookieOptions_UseConsoleSessionOptions()
    {
        await using var app = await StartAsync(configuration: new() { ["Auth:SessionLifetime"] = "02:00:00" });

        var cookie = app.Services.GetRequiredService<IOptionsMonitor<Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions>>()
            .Get(SessionDefaults.Scheme);

        cookie.ExpireTimeSpan.ShouldBe(TimeSpan.FromHours(2));
        cookie.SlidingExpiration.ShouldBeTrue();
        cookie.Cookie.Name.ShouldBe(SessionDefaults.CookieName);
    }

    [Fact]
    public async Task RevalidationIntervalZero_IsAllowed()
    {
        // Zero = revalidate every request; the integration tests use it to observe changes immediately (AUTH-11).
        await using var app = await StartAsync(configuration: new() { ["Auth:RevalidationInterval"] = "00:00:00" });

        app.Services.GetRequiredService<IOptions<ConsoleSessionOptions>>().Value.RevalidationInterval.ShouldBe(TimeSpan.Zero);
    }

    [Fact]
    public async Task ConsoleSessionOptions_HaveAdr0009Defaults()
    {
        await using var app = await StartAsync();

        var options = app.Services.GetRequiredService<IOptions<ConsoleSessionOptions>>().Value;

        options.SessionLifetime.ShouldBe(TimeSpan.FromHours(8));
        options.RevalidationInterval.ShouldBe(TimeSpan.FromSeconds(60));
    }

    [Theory]
    [InlineData("Auth:SessionLifetime", "00:00:00")]
    [InlineData("Auth:RevalidationInterval", "-00:00:01")]
    [InlineData("Auth:RevalidationInterval", "08:00:00")]
    [InlineData("Auth:RevalidationInterval", "09:00:00")]
    public async Task InvalidConsoleSessionOptions_FailStartup(string key, string value)
    {
        await Should.ThrowAsync<OptionsValidationException>(async () =>
        {
            await using var app = await StartAsync(configuration: new() { [key] = value });
        });
    }

    private static async Task<WebApplication> StartAsync(string environment = "Production", Dictionary<string, string?>? configuration = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(configuration ?? []);
        builder.Services.AddApiProblemDetails();
        builder.Services.AddSingleton<IClock>(new ManualClock());
        builder.AddApiAuthentication();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapGet("/protected", () => "ok").RequireAuthorization();
        app.MapGet("/admin", () => "ok").RequireAuthorization(AuthorizationPolicies.Admin);
        app.MapPost("/sign-in", (HttpContext context, string role) => context.SignInAsync(
            SessionPrincipalFactory.Create(new SessionUser(
                UserId.New(), "alice", role == "admin" ? UserRole.Admin : UserRole.User, IsReadOnly: false, Guid.NewGuid()))));

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

    private static async Task<string> SignInAsync(HttpClient client, UserRole role)
    {
        using var response = await client.PostAsync(new Uri($"/sign-in?role={(role == UserRole.Admin ? "admin" : "user")}", UriKind.Relative), null, Ct);
        response.EnsureSuccessStatusCode();
        var setCookie = response.Headers.GetValues("Set-Cookie").Single(h => h.StartsWith(SessionDefaults.CookieName + "=", StringComparison.Ordinal));
        return setCookie.Split(';')[0];
    }

    private static async Task<HttpResponseMessage> SendWithCookieAsync(HttpClient client, string path, string cookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(path, UriKind.Relative));
        request.Headers.Add("Cookie", cookie);
        return await client.SendAsync(request, Ct);
    }

    private static async Task ShouldBeProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code, string detail)
    {
        response.StatusCode.ShouldBe(status);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("status").GetInt32().ShouldBe((int)status);
        json.GetProperty("code").GetString().ShouldBe(code);
        json.GetProperty("detail").GetString().ShouldBe(detail);
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }
}
