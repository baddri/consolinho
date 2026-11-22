using FleetConsole.Api.Auth;
using Microsoft.AspNetCore.WebUtilities;

namespace FleetConsole.Api.Tests.Auth;

/// <summary>AUTH-2: only local paths survive <see cref="ReturnUrlPolicy"/>; contract §4.1. Plus the login redirect URLs.</summary>
public sealed class ReturnUrlPolicyTests
{
    [Theory]
    [InlineData("/")]
    [InlineData("/clusters")]
    [InlineData("/c/prod-eu-1/k8s/ns/default/pods?sort=name&dir=asc")]
    [InlineData("/fleet/admin/users#top")]
    [InlineData("/search?q=%2F%2Fevil.example")]
    [InlineData("/login")]
    public void LocalPaths_AreKept(string returnUrl) => ReturnUrlPolicy.Sanitize(returnUrl).ShouldBe(returnUrl);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("https://evil.example")]
    [InlineData("http://evil.example/path")]
    [InlineData("//evil.example")]
    [InlineData("//evil.example/path")]
    [InlineData("///evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("\\\\evil.example")]
    [InlineData("/path\\..\\x")]
    [InlineData("javascript:alert(1)")]
    [InlineData("%2F%2Fevil.example")]
    [InlineData("clusters")]
    [InlineData(" /clusters")]
    [InlineData("/clus ters")]
    [InlineData("/clusters\r\nSet-Cookie: x=1")]
    [InlineData("/\tevil")]
    [InlineData("/café")]
    public void EverythingElse_BecomesRoot(string? returnUrl) => ReturnUrlPolicy.Sanitize(returnUrl).ShouldBe("/");

    [Fact]
    public void OverlongValues_BecomeRoot()
    {
        ReturnUrlPolicy.Sanitize("/" + new string('a', ReturnUrlPolicy.MaxLength - 1)).Length.ShouldBe(ReturnUrlPolicy.MaxLength);
        ReturnUrlPolicy.Sanitize("/" + new string('a', ReturnUrlPolicy.MaxLength)).ShouldBe("/");
    }

    [Fact]
    public void LoginRedirect_EncodesAllParameters_AndSanitizesTheReturnUrl()
    {
        var location = LoginRedirect.ForError(LoginErrorCodes.NotRegistered, "//evil.example", "dev user&x=1");

        location.ShouldStartWith("/login?");
        var query = QueryHelpers.ParseQuery(location[location.IndexOf('?', StringComparison.Ordinal)..]);
        query["error"].ToString().ShouldBe("not_registered");
        query["username"].ToString().ShouldBe("dev user&x=1");
        query["returnUrl"].ToString().ShouldBe("/");
        query.Count.ShouldBe(3);
    }

    [Fact]
    public void LoginRedirect_WithoutUsername_HasErrorAndReturnUrlOnly()
    {
        LoginRedirect.ForError(LoginErrorCodes.Unavailable, "/clusters?x=1")
            .ShouldBe("/login?error=unavailable&returnUrl=%2Fclusters%3Fx%3D1");
    }
}
