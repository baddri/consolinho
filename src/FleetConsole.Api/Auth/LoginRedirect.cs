using Microsoft.AspNetCore.WebUtilities;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Builds the redirects to the SPA's login page that end every unsuccessful login (contract §4.1/§4.2):
/// <c>/login?error=&lt;code&gt;[&amp;username=…]&amp;returnUrl=…</c>. The SPA shows the message for the code (AUTH-6/7/14).
/// </summary>
/// <remarks>
/// The redirect is a relative URL, so the browser stays on the origin it used (the Vite URL in development, the route in
/// production). Login failures are never errors in the HTTP sense: the user always lands on a page with a message.
/// </remarks>
public static class LoginRedirect
{
    /// <summary>The SPA's login route.</summary>
    public const string LoginPath = "/login";

    /// <summary>
    /// The login page URL for a failed or refused login.
    /// </summary>
    /// <param name="error">One of the <see cref="LoginErrorCodes"/>.</param>
    /// <param name="returnUrl">Where the user wanted to go; sanitized again here.</param>
    /// <param name="username">The OpenShift username, only for <see cref="LoginErrorCodes.NotRegistered"/>.</param>
    /// <returns>A relative URL with an encoded query string.</returns>
    public static string ForError(string error, string? returnUrl, string? username = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(error);

        var query = new List<KeyValuePair<string, string?>> { new("error", error) };
        if (username is not null)
        {
            query.Add(new("username", username));
        }

        query.Add(new("returnUrl", ReturnUrlPolicy.Sanitize(returnUrl)));
        return QueryHelpers.AddQueryString(LoginPath, query);
    }
}

/// <summary>The <c>error</c> values the backend puts on <c>/login</c> (contract §4.2); the SPA maps them to messages.</summary>
public static class LoginErrorCodes
{
    /// <summary>AUTH-6: unknown OpenShift user while auto-provisioning is off (with <c>username</c>).</summary>
    public const string NotRegistered = "not_registered";

    /// <summary>AUTH-7: the FleetConsole user is deactivated.</summary>
    public const string Deactivated = "deactivated";

    /// <summary>AUTH-14: the user pressed Cancel on the OpenShift login (<c>error=access_denied</c>).</summary>
    public const string Cancelled = "cancelled";

    /// <summary>AUTH-14: the host OAuth server or <c>users/~</c> could not be reached or failed with a server error.</summary>
    public const string Unavailable = "unavailable";

    /// <summary>Anything else: bad state/correlation, PKCE or code rejected, unexpected responses, login races.</summary>
    public const string Failed = "failed";
}
