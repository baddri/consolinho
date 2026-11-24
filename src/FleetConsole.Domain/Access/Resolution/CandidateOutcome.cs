namespace FleetConsole.Domain.Access.Resolution;

/// <summary>
/// Why a candidate grant won or lost in <see cref="AccessResolver.Resolve"/>. The Effective access view (EFF-2) renders
/// each value as a reason ("Overridden by direct grant", "Lower priority than X", "Tie: read-only wins").
/// </summary>
public enum CandidateOutcome
{
    /// <summary>The grant that applies: its credential and access mode are used.</summary>
    Winner = 0,

    /// <summary>A group grant that lost because the user has a direct grant on the cluster (PREC-3).</summary>
    OverriddenByDirectGrant = 1,

    /// <summary>A group grant that lost to a group grant with a higher priority (PREC-4).</summary>
    LowerPriority = 2,

    /// <summary>A read-write group grant that tied with the winner on priority and lost because the winner is read-only (PREC-5).</summary>
    TieReadOnlyWins = 3,

    /// <summary>A group grant that tied with the winner on priority and access mode and lost the grant-id tiebreak (PREC-5).</summary>
    TieBrokenById = 4,
}
