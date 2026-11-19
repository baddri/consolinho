using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Grants.RevokeGrant;

/// <summary>
/// Handles <see cref="RevokeGrantCommand"/>: raises <see cref="Grant.Revoke"/>'s event (with display names for the
/// audit entry) and removes the aggregate; <c>UnitOfWorkBehavior</c> commits both.
/// </summary>
/// <param name="grants">Grant repository.</param>
/// <param name="users">User repository (audit labels).</param>
/// <param name="clusters">Cluster repository (audit labels).</param>
/// <param name="credentials">Credential repository (audit labels).</param>
internal sealed class RevokeGrantHandler(
    IGrantRepository grants,
    IUserRepository users,
    IClusterRepository clusters,
    ICredentialRepository credentials) : IRequestHandler<RevokeGrantCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RevokeGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var grant = await grants.GetByIdAsync(new GrantId(request.GrantId), cancellationToken).ConfigureAwait(false);
        if (grant is null)
        {
            return GrantErrors.NotFound();
        }

        grant.Revoke(await GrantLookup.LabelsAsync(grant, users, clusters, credentials, cancellationToken).ConfigureAwait(false));
        grants.Remove(grant);
        return Result.Success();
    }
}
