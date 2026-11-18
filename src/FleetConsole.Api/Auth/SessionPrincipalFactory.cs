using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Claims;
using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Auth;

/// <summary>
/// The only code that writes or parses session claims (ADR-0009): converts a <see cref="SessionUser"/> into the
/// <see cref="ClaimsPrincipal"/> stored in the session cookie and back.
/// </summary>
/// <remarks>
/// Parsing is strict: a principal with a missing, duplicated or malformed claim is treated as no session at all, so a
/// cookie from an older format or a tampered principal can never yield a partially filled identity (e.g. a user id
/// without a role). Data Protection already prevents tampering with the cookie; this guards against our own bugs and
/// format changes.
/// </remarks>
public static class SessionPrincipalFactory
{
    /// <summary>Builds the session principal for <paramref name="user"/> (authentication type = the session scheme).</summary>
    /// <param name="user">The signed-in user's session facts.</param>
    /// <returns>A principal whose name and role claim types are <see cref="SessionClaims.Username"/>/<see cref="SessionClaims.Role"/>.</returns>
    public static ClaimsPrincipal Create(SessionUser user)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentException.ThrowIfNullOrWhiteSpace(user.Username);

        Claim[] claims =
        [
            new(SessionClaims.UserId, user.UserId.Value.ToString("D")),
            new(SessionClaims.Username, user.Username),
            new(SessionClaims.Role, ToClaimValue(user.Role)),
            new(SessionClaims.ReadOnly, user.IsReadOnly ? "true" : "false"),
            new(SessionClaims.SecurityStamp, user.SecurityStamp.ToString("D")),
        ];

        return new ClaimsPrincipal(new ClaimsIdentity(claims, SessionDefaults.Scheme, SessionClaims.Username, SessionClaims.Role));
    }

    /// <summary>Reads the session facts from an authenticated principal.</summary>
    /// <param name="principal">Typically <c>HttpContext.User</c>.</param>
    /// <param name="user">The parsed facts when the method returns <see langword="true"/>.</param>
    /// <returns><see langword="true"/> if the principal is authenticated and every session claim is present exactly
    /// once and well-formed; otherwise <see langword="false"/> (treat as anonymous).</returns>
    public static bool TryRead(ClaimsPrincipal? principal, [NotNullWhen(true)] out SessionUser? user)
    {
        user = null;

        if (principal?.Identity is not { IsAuthenticated: true })
        {
            return false;
        }

        if (!TryGetSingle(principal, SessionClaims.UserId, out var userIdValue)
            || !Guid.TryParseExact(userIdValue, "D", out var userId)
            || userId == Guid.Empty
            || !TryGetSingle(principal, SessionClaims.Username, out var username)
            || string.IsNullOrWhiteSpace(username)
            || !TryGetSingle(principal, SessionClaims.Role, out var roleValue)
            || !TryParseRole(roleValue, out var role)
            || !TryGetSingle(principal, SessionClaims.ReadOnly, out var readOnlyValue)
            || !TryParseFlag(readOnlyValue, out var isReadOnly)
            || !TryGetSingle(principal, SessionClaims.SecurityStamp, out var stampValue)
            || !Guid.TryParseExact(stampValue, "D", out var securityStamp))
        {
            return false;
        }

        user = new SessionUser(new UserId(userId), username, role, isReadOnly, securityStamp);
        return true;
    }

    /// <summary>Maps a role to its claim value (<c>admin</c>/<c>user</c>), the same spelling as the JSON enum.</summary>
    /// <param name="role">The role.</param>
    /// <returns>The claim value.</returns>
    /// <exception cref="ArgumentOutOfRangeException">For values outside the enum (a bug).</exception>
    public static string ToClaimValue(UserRole role) => role switch
    {
        UserRole.Admin => SessionClaims.AdminRoleValue,
        UserRole.User => SessionClaims.UserRoleValue,
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown user role."),
    };

    private static bool TryParseRole(string value, out UserRole role)
    {
        // Exact, case-sensitive values: the claim is ours, anything else is malformed.
        switch (value)
        {
            case SessionClaims.AdminRoleValue:
                role = UserRole.Admin;
                return true;
            case SessionClaims.UserRoleValue:
                role = UserRole.User;
                return true;
            default:
                role = default;
                return false;
        }
    }

    private static bool TryParseFlag(string value, out bool flag)
    {
        flag = string.Equals(value, "true", StringComparison.Ordinal);
        return flag || string.Equals(value, "false", StringComparison.Ordinal);
    }

    // A session claim must appear exactly once across all identities; two "role" claims would make IsInRole and the
    // Admin policy disagree with what this parser returns.
    private static bool TryGetSingle(ClaimsPrincipal principal, string type, [NotNullWhen(true)] out string? value)
    {
        value = null;
        foreach (var claim in principal.FindAll(type))
        {
            if (value is not null)
            {
                value = null;
                return false;
            }

            value = claim.Value;
        }

        return value is not null;
    }
}
