using Microsoft.AspNetCore.Authentication.OAuth;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Options of the <see cref="Scheme"/> authentication scheme: the server-side authorization code flow (+ PKCE) against
/// the host cluster's OpenShift OAuth server (ADR-0007/0010). Fixed protocol settings are set here; the endpoints,
/// client credentials and backchannel come from <see cref="OpenShiftOAuthOptionsSetup"/>, the events from
/// <see cref="OpenShiftLoginEvents"/>.
/// </summary>
/// <remarks>
/// <c>SaveTokens</c> stays <see langword="false"/>: the OpenShift access token is used once for <c>users/~</c> and must
/// never reach the session cookie (AUTH-3).
/// </remarks>
public sealed class OpenShiftOAuthOptions : OAuthOptions
{
    /// <summary>The authentication scheme name; <c>GET /api/auth/login</c> challenges it.</summary>
    public const string Scheme = "OpenShift";

    /// <summary>The OAuth callback path. Under <c>/api</c> because the Vite dev server proxies only <c>/api</c>.</summary>
    public const string CallbackPathValue = "/api/auth/callback";

    /// <summary>The only scope requested: enough to call <c>users/~</c>, nothing else (ADR-0007).</summary>
    public const string UserInfoScope = "user:info";

    /// <summary>Sets the fixed protocol settings.</summary>
    public OpenShiftOAuthOptions()
    {
        CallbackPath = CallbackPathValue;
        UsePkce = true;
        SaveTokens = false;
        Scope.Clear();
        Scope.Add(UserInfoScope);
    }
}
