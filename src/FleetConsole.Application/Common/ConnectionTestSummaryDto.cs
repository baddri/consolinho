using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Common;

/// <summary>
/// The last stored connection test result of a credential (TEST-5), as shown in cluster, credential and grant views.
/// Shared by several queries (contract §3); build it with <see cref="ConnectionTestSummaryMapping.ToDto"/>.
/// </summary>
/// <param name="TestedAt">When the test ran.</param>
/// <param name="Succeeded">Whether no step failed (warnings allowed).</param>
/// <param name="FailedStep">The first failed step; <see langword="null"/> when the test succeeded.</param>
/// <param name="Headline">The capability headline; <see langword="null"/> when the capabilities step did not run.</param>
/// <param name="IsStale">Whether the cluster's connection settings changed after the test ran (CLU-4), so the result
/// may no longer describe the current configuration.</param>
public sealed record ConnectionTestSummaryDto(
    DateTimeOffset TestedAt,
    bool Succeeded,
    ConnectionTestStep? FailedStep,
    CapabilityLevel? Headline,
    bool IsStale);
