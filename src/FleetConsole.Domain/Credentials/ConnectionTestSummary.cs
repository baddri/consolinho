namespace FleetConsole.Domain.Credentials;

/// <summary>
/// What is kept of a connection test run against a stored credential (TEST-5, ADR-0011): outcome, failed step, capability
/// headline and time. Raw responses and the token are never stored.
/// </summary>
/// <param name="TestedAt">When the test ran.</param>
/// <param name="Succeeded">Whether no step failed (warnings allowed).</param>
/// <param name="FailedStep">The first failed step; <see langword="null"/> exactly when <paramref name="Succeeded"/>.</param>
/// <param name="Headline">The capability headline; <see langword="null"/> when the capabilities step did not run.</param>
public sealed record ConnectionTestSummary(
    DateTimeOffset TestedAt,
    bool Succeeded,
    ConnectionTestStep? FailedStep,
    CapabilityLevel? Headline)
{
    /// <summary>
    /// Whether the cluster's connection settings changed after this test ran, so the result no longer describes the
    /// current configuration (CLU-4).
    /// </summary>
    /// <param name="connectionSettingsChangedAt">The cluster's <c>ConnectionSettingsChangedAt</c>.</param>
    /// <returns><see langword="true"/> when <see cref="TestedAt"/> is before <paramref name="connectionSettingsChangedAt"/>.</returns>
    public bool IsStaleSince(DateTimeOffset connectionSettingsChangedAt) => TestedAt < connectionSettingsChangedAt;
}
