using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Write-side access to <see cref="Grant"/> aggregates for command handlers, plus the counts and sets other aggregates
/// need as facts (one grant per user and cluster, credential in use, cluster deletion summary).
/// </summary>
public interface IGrantRepository
{
    /// <summary>Loads a grant by id for modification.</summary>
    /// <param name="id">The grant id.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked grant, or <see langword="null"/>.</returns>
    Task<Grant?> GetByIdAsync(GrantId id, CancellationToken cancellationToken);

    /// <summary>
    /// The clusters a user already has a grant on: the fact <see cref="Grant.Create"/> needs to enforce one grant per
    /// (user, cluster). The unique index on <c>(user_id, cluster_id)</c> catches races.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The cluster ids (empty when the user has no grants).</returns>
    Task<IReadOnlySet<ClusterId>> GetClusterIdsForUserAsync(UserId userId, CancellationToken cancellationToken);

    /// <summary>Counts the grants that use a credential (CRED-6: a credential in use can't be deleted).</summary>
    /// <param name="id">The credential.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of grants.</returns>
    Task<int> CountByCredentialAsync(CredentialId id, CancellationToken cancellationToken);

    /// <summary>
    /// Counts the grants that use a credential, by access mode, in one grouped SQL statement: the input of the
    /// connection test's grant-based hints (TEST-4). Kept on the repository so the test commands don't need the read
    /// model and <see cref="GrantModeCounts"/> stays a plain value.
    /// </summary>
    /// <param name="id">The credential.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The counts (zeros when no grant uses the credential).</returns>
    Task<GrantModeCounts> CountByModeAsync(CredentialId id, CancellationToken cancellationToken);

    /// <summary>Counts the grants on a cluster (for the <c>cluster.deleted</c> audit details, CLU-6).</summary>
    /// <param name="id">The cluster.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of grants.</returns>
    Task<int> CountByClusterAsync(ClusterId id, CancellationToken cancellationToken);

    /// <summary>Stages a new grant for insertion at commit.</summary>
    /// <param name="grant">The new grant.</param>
    void Add(Grant grant);

    /// <summary>Stages the deletion of a grant (revoke, after <see cref="Grant.Revoke"/> raised its event).</summary>
    /// <param name="grant">The tracked grant to delete.</param>
    void Remove(Grant grant);
}
