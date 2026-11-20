namespace FleetConsole.Api.Auth;

/// <summary>
/// Fixed names of FleetConsole's session (ADR-0009): the cookie authentication scheme every <c>/api</c> endpoint
/// authenticates with, and the cookie that carries the Data Protection–encrypted ticket.
/// </summary>
public static class SessionDefaults
{
    /// <summary>Name of the cookie authentication scheme; the default scheme of the Api.</summary>
    public const string Scheme = "Cookies";

    /// <summary>Name of the session cookie (HttpOnly; the SPA never reads it).</summary>
    public const string CookieName = "FleetConsole.Session";
}
