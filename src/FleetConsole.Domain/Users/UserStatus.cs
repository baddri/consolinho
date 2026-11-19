namespace FleetConsole.Domain.Users;

// The <summary> is published as the OpenAPI description of the UserStatus schema (and in the SPA's generated types):
// keep it consumer-facing, plain text, no cref. Implementation notes belong in <remarks>.

/// <summary>
/// Lifecycle state of a user: pending (created by an administrator, never logged in), active, or deactivated.
/// </summary>
/// <remarks>
/// Derived by <see cref="User.Status"/> from <see cref="User.IsDeactivated"/> and <see cref="User.LastLoginAt"/>; never
/// stored. Read-model projections compute it in SQL with the same precedence: deactivated, then pending, then active.
/// </remarks>
public enum UserStatus
{
    /// <summary>Pre-created by an admin and never logged in (and not deactivated).</summary>
    Pending = 0,

    /// <summary>Has logged in at least once and is not deactivated.</summary>
    Active = 1,

    /// <summary>Deactivated by an admin: login is refused and existing sessions end at the next revalidation.</summary>
    Deactivated = 2,
}
