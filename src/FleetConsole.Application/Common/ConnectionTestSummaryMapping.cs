using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Common;

/// <summary>
/// Maps the Domain's stored <see cref="ConnectionTestSummary"/> to the API's <see cref="ConnectionTestSummaryDto"/>.
/// One place for the staleness rule's use, so every view reports <c>isStale</c> the same way.
/// </summary>
public static class ConnectionTestSummaryMapping
{
    /// <summary>
    /// Creates the DTO, or <see langword="null"/> when the credential was never tested. Pure: call it in memory after the
    /// SQL projection selected the summary and the cluster's <c>ConnectionSettingsChangedAt</c>.
    /// </summary>
    /// <param name="summary">The credential's <see cref="Credential.LastTest"/>.</param>
    /// <param name="connectionSettingsChangedAt">The cluster's <c>ConnectionSettingsChangedAt</c>.</param>
    /// <returns>The DTO, with <c>IsStale</c> from <see cref="ConnectionTestSummary.IsStaleSince"/>.</returns>
    public static ConnectionTestSummaryDto? ToDto(ConnectionTestSummary? summary, DateTimeOffset connectionSettingsChangedAt) =>
        summary is null
            ? null
            : new ConnectionTestSummaryDto(
                summary.TestedAt,
                summary.Succeeded,
                summary.FailedStep,
                summary.Headline,
                summary.IsStaleSince(connectionSettingsChangedAt));
}
