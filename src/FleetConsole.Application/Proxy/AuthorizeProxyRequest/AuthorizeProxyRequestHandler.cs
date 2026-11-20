using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy.AuthorizeProxyRequest;

/// <summary>
/// Answers <see cref="AuthorizeProxyRequestQuery"/>: loads the user's access to the cluster in one SQL statement, then
/// runs the <see cref="IProxyPolicy"/> chain in registration order and returns the first failure, or the
/// <see cref="ProxyTarget"/> with the decrypted token.
/// </summary>
/// <remarks>
/// <para><b>Not available.</b> A malformed name, an unknown or disabled cluster, no grant, a deactivated user and a
/// missing credential all end in the same <c>Proxy.NotAvailable</c> (PRX-2): the inner joins simply return no row,
/// so the cases can't be told apart from outside — nor, deliberately, inside.</para>
/// <para><b>Read-only.</b> The stored user's flag or the session's, whichever is stricter (as
/// <c>ListAccessibleClustersHandler</c> does), so a read-only change applies before the session is revalidated.</para>
/// </remarks>
/// <param name="readModel">The read model.</param>
/// <param name="currentUser">The signed-in user.</param>
/// <param name="tokenProtector">Decrypts the stored ServiceAccount token.</param>
/// <param name="policies">The policy chain, in registration order.</param>
internal sealed class AuthorizeProxyRequestHandler(
    IReadModel readModel,
    ICurrentUser currentUser,
    ITokenProtector tokenProtector,
    IEnumerable<IProxyPolicy> policies) : IRequestHandler<AuthorizeProxyRequestQuery, Result<ProxyTarget>>
{
    /// <inheritdoc />
    public async Task<Result<ProxyTarget>> Handle(AuthorizeProxyRequestQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var name = ClusterName.Create(request.ClusterName);
        if (name.IsFailure)
        {
            // Don't echo whatever was in the URL back into the message.
            return ProxyErrors.NotAvailableUnnamed;
        }

        if (currentUser.UserId is not { } userId)
        {
            // AuthorizationBehavior only lets signed-in users through; without an id there is no access to find.
            return ProxyErrors.NotAvailable(name.Value.Value);
        }

        var clusterName = name.Value;
        var query =
            from g in readModel.Grants
            where g.UserId == userId
            join u in readModel.Users on g.UserId equals u.Id
            where !u.IsDeactivated
            join c in readModel.Clusters on g.ClusterId equals c.Id
            where c.IsEnabled && c.Name == clusterName
            join cr in readModel.Credentials on g.CredentialId equals cr.Id
            select new
            {
                ClusterId = c.Id,
                c.Endpoint,
                c.Environment,
                g.AccessMode,
                UserIsReadOnly = u.IsReadOnly,
                u.Username,
                cr.Token,
            };
        var row = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return ProxyErrors.NotAvailable(clusterName.Value);
        }

        var context = new ProxyRequestContext(
            userId,
            row.Username.Value,
            clusterName.Value,
            row.Environment,
            row.AccessMode,
            row.UserIsReadOnly || currentUser.IsReadOnly,
            request.Request);

        // Order is the registration order (AddApplication); the first refusal wins.
        foreach (var policy in policies)
        {
            var decision = await policy.EvaluateAsync(context, cancellationToken).ConfigureAwait(false);
            if (decision.IsFailure)
            {
                return decision.Error;
            }
        }

        var connection = new ClusterConnection(row.Endpoint.Url, row.Endpoint.CaBundle?.Pem, row.Endpoint.SkipTlsVerify);
        return new ProxyTarget(row.ClusterId, clusterName.Value, connection, tokenProtector.Unprotect(row.Token));
    }
}
