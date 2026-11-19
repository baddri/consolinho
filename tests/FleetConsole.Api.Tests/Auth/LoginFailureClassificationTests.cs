using FleetConsole.Api.Auth;
using FleetConsole.Application.Auth;
using Microsoft.AspNetCore.Authentication;

namespace FleetConsole.Api.Tests.Auth;

/// <summary>
/// AUTH-14 / contract §4.2: how a failed OAuth callback maps to <c>/login?error=</c>. The integration tests drive the
/// main paths end to end; this pins the whole table.
/// </summary>
public sealed class LoginFailureClassificationTests
{
    [Theory]
    [InlineData("access_denied", "cancelled")]
    [InlineData("temporarily_unavailable", "unavailable")]
    [InlineData("server_error", "unavailable")]
    [InlineData("invalid_scope", "failed")]
    [InlineData("unauthorized_client", "failed")]
    public void OAuthServerErrors(string error, string expected)
    {
        var failure = new AuthenticationFailureException("remote error");
        failure.Data["error"] = error;

        OpenShiftLoginEvents.Classify(failure).ShouldBe(expected);
    }

    [Fact]
    public void IdentityEndpointUnavailable_IsUnavailable() =>
        OpenShiftLoginEvents.Classify(new ExternalIdentityUnavailableException()).ShouldBe("unavailable");

    [Fact]
    public void TokenEndpointUnavailable_IsUnavailable() =>
        OpenShiftLoginEvents.Classify(new OAuthServerUnavailableException()).ShouldBe("unavailable");

    [Fact]
    public void WrappedUnavailability_IsUnavailable() =>
        OpenShiftLoginEvents.Classify(new AuthenticationFailureException("wrapped", new OAuthServerUnavailableException()))
            .ShouldBe("unavailable");

    [Fact]
    public void UnexpectedIdentityResponse_IsFailed() =>
        OpenShiftLoginEvents.Classify(new InvalidOperationException("users/~ without metadata.name")).ShouldBe("failed");

    [Theory]
    [InlineData("The oauth state was missing or invalid.")]
    [InlineData("Correlation failed.")]
    [InlineData("The host OAuth token endpoint rejected the authorization code (HTTP 400).")]
    public void ProtocolFailures_AreFailed(string message) =>
        OpenShiftLoginEvents.Classify(new AuthenticationFailureException(message)).ShouldBe("failed");

    [Fact]
    public void NoFailure_IsFailed() => OpenShiftLoginEvents.Classify(null).ShouldBe("failed");
}
