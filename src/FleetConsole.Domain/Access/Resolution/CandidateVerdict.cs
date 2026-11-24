namespace FleetConsole.Domain.Access.Resolution;

/// <summary>
/// The resolver's decision about one considered candidate: whether it won and, if not, which rule and which group beat it.
/// The Effective access view (EFF-2) renders one verdict per row.
/// </summary>
/// <param name="Candidate">The candidate grant the verdict is about.</param>
/// <param name="Outcome">Whether it won, or the rule that made it lose.</param>
/// <param name="BeatenByGroup">The winning group's name when a group grant beat this candidate (lower priority or a tie);
/// <see langword="null"/> for the winner and for candidates overridden by a direct grant.</param>
public sealed record CandidateVerdict(AccessCandidate Candidate, CandidateOutcome Outcome, string? BeatenByGroup);
