namespace FleetConsole.Domain.Access;

/// <summary>Strongly typed identity of a <see cref="Grant"/>; grants are addressed by id in URLs (ADR-0013 §1).</summary>
/// <param name="Value">The underlying GUID (version 7, so ids sort roughly by creation time and index well).</param>
public readonly record struct GrantId(Guid Value)
{
    /// <summary>Creates a new, time-ordered (version 7) identity for a grant that is being created.</summary>
    /// <returns>A fresh <see cref="GrantId"/>.</returns>
    public static GrantId New() => new(Guid.CreateVersion7());
}
