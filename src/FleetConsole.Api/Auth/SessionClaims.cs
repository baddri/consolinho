namespace FleetConsole.Api.Auth;

/// <summary>
/// Claim types stored in the session cookie (ADR-0009). Only <see cref="SessionPrincipalFactory"/> writes and parses
/// them; everything else reads identity through <c>ICurrentUser</c> (Application) or the <c>Admin</c> policy.
/// </summary>
/// <remarks>
/// Short names keep the cookie small. The session deliberately holds no groups and no OpenShift token: groups are only
/// needed at login (admin-group evaluation) and the OCP access token is discarded right after it (SECURITY.md).
/// </remarks>
public static class SessionClaims
{
    /// <summary>The FleetConsole user id (<c>UserId</c> GUID, "D" format).</summary>
    public const string UserId = "fc:uid";

    /// <summary>The username; also the identity's name claim type, so <c>User.Identity.Name</c> works.</summary>
    public const string Username = "name";

    /// <summary>The effective role, <see cref="AdminRoleValue"/> or <see cref="UserRoleValue"/>; the identity's role claim type.</summary>
    public const string Role = "role";

    /// <summary>Whether the user is globally read-only (ADM-2): <c>true</c> or <c>false</c>.</summary>
    public const string ReadOnly = "fc:ro";

    /// <summary>The user's security stamp at sign-in (GUID); revalidation signs the session out when it changes.</summary>
    public const string SecurityStamp = "fc:stamp";

    /// <summary>Value of <see cref="Role"/> for administrators; the <c>Admin</c> policy requires it.</summary>
    public const string AdminRoleValue = "admin";

    /// <summary>Value of <see cref="Role"/> for regular users.</summary>
    public const string UserRoleValue = "user";
}
