using FleetConsole.Api.Tests.DevOAuth;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Configuration every Api test host needs since the Api requires <c>Auth:OpenShift:*</c> and
/// <c>Console:PublicOrigin</c> at startup (T-0014/T-0015).
/// </summary>
internal static class TestHostConfiguration
{
    /// <summary>The public origin of test hosts: the same host as <c>TestServer</c>'s base address.</summary>
    public const string PublicOrigin = "http://localhost";

    /// <summary>
    /// Login against the in-process emulator (<see cref="TestOAuthServer"/>, base address <c>http://localhost</c>);
    /// allowed in Development only (http).
    /// </summary>
    public static Dictionary<string, string?> Emulator() => new()
    {
        ["Console:PublicOrigin"] = PublicOrigin,
        ["Auth:OpenShift:HostApiServerUrl"] = "http://localhost",
        ["Auth:OpenShift:ClientId"] = DevOAuthFlow.ClientId,
        ["Auth:OpenShift:ClientSecret"] = DevOAuthFlow.ClientSecret,
    };

    /// <summary>
    /// A login configuration that passes validation in every environment (https everywhere) and never makes an outbound
    /// call: the static endpoints skip discovery, and <c>.invalid</c> hosts never resolve. For hosts whose tests don't
    /// log in, notably the Production-environment ones.
    /// </summary>
    public static Dictionary<string, string?> Offline() => new()
    {
        ["Console:PublicOrigin"] = "https://console.invalid",
        ["Auth:OpenShift:HostApiServerUrl"] = "https://host-api.invalid:6443",
        ["Auth:OpenShift:AuthorizationEndpoint"] = "https://oauth.invalid/oauth/authorize",
        ["Auth:OpenShift:TokenEndpoint"] = "https://oauth.invalid/oauth/token",
        ["Auth:OpenShift:ClientId"] = DevOAuthFlow.ClientId,
        ["Auth:OpenShift:ClientSecret"] = DevOAuthFlow.ClientSecret,
    };
}
