using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// How many grants use a credential, by access mode: the input of the grant-based hints (TEST-4). <see langword="null"/>
/// instead of an instance means "no credential known" (an unsaved token tested without <c>credentialId</c>), so there are
/// no grant-based hints.
/// </summary>
/// <param name="ReadOnly">Grants with <see cref="AccessMode.ReadOnly"/>.</param>
/// <param name="ReadWrite">Grants with <see cref="AccessMode.ReadWrite"/>.</param>
public sealed record GrantModeCounts(int ReadOnly, int ReadWrite)
{
    /// <summary>
    /// Counts the grants of one credential by mode in a single grouped query. Read through <see cref="IReadModel"/>
    /// (no tracking): the test commands only need the numbers, not the grant aggregates.
    /// </summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="credentialId">The credential.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The counts (zeros when no grant uses the credential).</returns>
    internal static async Task<GrantModeCounts> ReadAsync(
        IReadModel readModel, CredentialId credentialId, CancellationToken cancellationToken)
    {
        var query = readModel.Grants
            .Where(g => g.CredentialId == credentialId)
            .GroupBy(g => g.AccessMode)
            .Select(group => new ModeCount(group.Key, group.Count()));
        var counts = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);

        int CountOf(AccessMode mode) => counts.Where(c => c.Mode == mode).Sum(c => c.Count);
        return new GrantModeCounts(CountOf(AccessMode.ReadOnly), CountOf(AccessMode.ReadWrite));
    }

    private sealed record ModeCount(AccessMode Mode, int Count);
}
