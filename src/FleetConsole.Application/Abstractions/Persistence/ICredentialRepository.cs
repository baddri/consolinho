using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Write-side access to <see cref="Credential"/> aggregates for command handlers (add, rotate, test, delete, and
/// resolving the credentials referenced by grants). Changes are committed by <c>UnitOfWorkBehavior</c>.
/// </summary>
public interface ICredentialRepository
{
    /// <summary>Loads a credential by id for modification.</summary>
    /// <param name="id">The credential id.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked credential, or <see langword="null"/>.</returns>
    Task<Credential?> GetByIdAsync(CredentialId id, CancellationToken cancellationToken);

    /// <summary>Loads several credentials by id in one query (bulk grant). Unknown ids are absent from the result.</summary>
    /// <param name="ids">The ids to look up.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked credentials that exist, in no particular order.</returns>
    Task<IReadOnlyList<Credential>> GetByIdsAsync(IReadOnlyCollection<CredentialId> ids, CancellationToken cancellationToken);

    /// <summary>
    /// Whether the cluster already has a credential with this name. Friendly pre-check; the unique index on
    /// <c>(cluster_id, name)</c> catches races (<see cref="DuplicateKeyException"/>).
    /// </summary>
    /// <param name="clusterId">The cluster.</param>
    /// <param name="name">The credential name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns><see langword="true"/> when the name is taken within the cluster.</returns>
    Task<bool> NameExistsAsync(ClusterId clusterId, CredentialName name, CancellationToken cancellationToken);

    /// <summary>Counts the credentials of a cluster (for the <c>cluster.deleted</c> audit details, CLU-6).</summary>
    /// <param name="clusterId">The cluster.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of credentials.</returns>
    Task<int> CountByClusterAsync(ClusterId clusterId, CancellationToken cancellationToken);

    /// <summary>Stages a new credential for insertion at commit.</summary>
    /// <param name="credential">The new credential.</param>
    void Add(Credential credential);

    /// <summary>
    /// Stages the deletion of a credential (CRED-6, after <see cref="Credential.MarkForDeletion"/> succeeded). The
    /// database refuses the delete if a grant still references it (foreign key, checked at statement end).
    /// </summary>
    /// <param name="credential">The tracked credential to delete.</param>
    void Remove(Credential credential);
}
