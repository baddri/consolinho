namespace FleetConsole.Domain.Access.Resolution;

/// <summary>
/// The result of resolving a user's access to one cluster: the grant that applies, the effective access mode after the
/// user's read-only flag, and why every other applicable candidate lost. Shared by the proxy authorization query, the
/// switcher and Effective access, so all three agree (PREC-8, EFF-3).
/// </summary>
/// <param name="Winner">The grant that applies; its credential's token is used for the user's requests.</param>
/// <param name="EffectiveMode">The mode the proxy enforces: read-only if the winner or the user's flag says so (PREC-6).</param>
/// <param name="NarrowedByReadOnlyFlag"><see langword="true"/> when the winner is read-write but the user's read-only flag
/// narrowed it to read-only (EFF-2 "Narrowed to read-only by the user's read-only flag").</param>
/// <param name="Verdicts">Every considered candidate: the winner first, then by priority descending, then by grant id.
/// Candidates dropped for membership (non-member or <c>system:*</c> groups) are not included.</param>
/// <param name="TieDetected"><see langword="true"/> when two or more group candidates shared the winning priority. Ties
/// are refused at save (ADR-0034 §4), so callers log a warning when one slips through (PREC-5).</param>
public sealed record AccessResolution(
    AccessCandidate Winner,
    AccessMode EffectiveMode,
    bool NarrowedByReadOnlyFlag,
    IReadOnlyList<CandidateVerdict> Verdicts,
    bool TieDetected);
