namespace FleetConsole.Application.Auth;

/// <summary>
/// Audit actions the login use cases record themselves (contract §10), because they change no aggregate: a denied
/// login and a logout. <c>auth.login</c> comes from the <c>UserLoggedIn</c> domain event instead
/// (<c>UserAuditHandler</c>).
/// </summary>
internal static class AuthAuditActions
{
    /// <summary>A login refused by FleetConsole (not registered, deactivated); details <c>{ reason }</c>.</summary>
    public const string LoginDenied = "auth.login_denied";

    /// <summary>A signed-in user logged out; details <c>{}</c>.</summary>
    public const string Logout = "auth.logout";
}
