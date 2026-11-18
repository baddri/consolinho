namespace FleetConsole.Api.Auth;

/// <summary>
/// Names of the Api's endpoint authorization policies. The default policy (an authenticated session) protects the
/// whole <c>/api</c> group; <see cref="Admin"/> additionally protects <c>/api/admin</c>.
/// </summary>
public static class AuthorizationPolicies
{
    /// <summary>
    /// Authenticated session whose role claim is <c>admin</c>. The endpoint half of the Administration check; the
    /// Application's <c>AuthorizationBehavior</c> (<c>IAdminRequest</c>) is the other half (SECURITY.md).
    /// </summary>
    public const string Admin = "Admin";
}
