using FleetConsole.Domain.Credentials;

namespace FleetConsole.Domain.Access.Resolution;

/// <summary>
/// One grant on a single cluster that may apply to the user being resolved: either a direct user grant or a group grant
/// (ADR-0034 §1). It is the <see cref="AccessResolver"/>'s input; callers map persisted grants to candidates, so the
/// resolver stays independent of how grants are stored and loaded.
/// </summary>
/// <param name="GrantId">The grant's id; also the last-resort tiebreak (Guid v7, so the lowest id is the oldest grant).</param>
/// <param name="GroupName">The host group the grant targets, or <see langword="null"/> for a direct user grant.</param>
/// <param name="Priority">The admin-set priority of a group grant (higher wins, PREC-4); required for group grants and
/// ignored for direct grants.</param>
/// <param name="AccessMode">What the grant allows before the user's read-only flag is applied.</param>
/// <param name="CredentialId">The credential whose token the proxy uses when this grant wins.</param>
public sealed record AccessCandidate(
    GrantId GrantId,
    string? GroupName,
    int? Priority,
    AccessMode AccessMode,
    CredentialId CredentialId)
{
    /// <summary>
    /// <see langword="true"/> for a direct user grant (no group). A direct grant beats every group grant on the
    /// cluster (PREC-3).
    /// </summary>
    public bool IsDirect => GroupName is null;
}
