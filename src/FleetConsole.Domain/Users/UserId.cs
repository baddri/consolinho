namespace FleetConsole.Domain.Users;

/// <summary>
/// Strongly typed identity of a <see cref="User"/>. Other aggregates (grants, audit actors) reference users through it,
/// so a user id can never be confused with a cluster or credential id. The username is the natural key users and
/// admins see; this id is the stable key that survives in references and session claims (<c>fc:uid</c>, ADR-0009).
/// </summary>
/// <param name="Value">The underlying GUID (version 7, so ids sort roughly by creation time and index well).</param>
public readonly record struct UserId(Guid Value)
{
    /// <summary>Creates a new, time-ordered (version 7) identity for a user that is being created or provisioned.</summary>
    /// <returns>A fresh <see cref="UserId"/>.</returns>
    public static UserId New() => new(Guid.CreateVersion7());
}
