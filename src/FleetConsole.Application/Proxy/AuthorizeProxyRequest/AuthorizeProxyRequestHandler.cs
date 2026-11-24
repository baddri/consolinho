using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Access;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy.AuthorizeProxyRequest;

/// <summary>
/// Answers <see cref="AuthorizeProxyRequestQuery"/>: resolves the user's access to the cluster with
/// <see cref="ClusterAccessReader"/> (one SQL statement, direct and group grants, ADR-0019/ADR-0034), then runs the
/// <see cref="IProxyPolicy"/> chain in registration order and returns the first failure, or the
/// <see cref="ProxyTarget"/> with the winning grant's decrypted token.
/// </summary>
/// <remarks>
/// <para><b>Not available.</b> A malformed name, an unknown or disabled cluster, no direct or group grant, a deactivated
/// user and a missing credential all end in the same <c>Proxy.NotAvailable</c> (PRX-2, PREC-7): the reader simply
/// returns nothing, so the cases can't be told apart from outside — nor, deliberately, inside.</para>
/// <para><b>Winner.</b> The policies see the winning grant's own mode (direct beats group, then priority, PREC-3/4) and
/// the user's read-only flag separately, so the mutation guard can still say which of the two refused.</para>
/// <para><b>Read-only.</b> The stored user's flag or the session's, whichever is stricter (as
/// <c>ListAccessibleClustersHandler</c> does), so a read-only change applies before the session is revalidated.</para>
/// </remarks>
/// <param name="reader">Loads and resolves the user's grants on the cluster.</param>
/// <param name="currentUser">The signed-in user.</param>
/// <param name="tokenProtector">Decrypts the stored ServiceAccount token.</param>
/// <param name="policies">The policy chain, in registration order.</param>
internal sealed class AuthorizeProxyRequestHandler(
    ClusterAccessReader reader,
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
        var accesses = await reader.LoadAsync(userId, clusterName, currentUser.IsReadOnly, cancellationToken).ConfigureAwait(false);
        if (accesses is not [var access])
        {
            // The name is unique, so there is at most one entry; none means not available (PRX-2).
            return ProxyErrors.NotAvailable(clusterName.Value);
        }

        var context = new ProxyRequestContext(
            userId,
            access.Username,
            clusterName.Value,
            access.Environment,
            access.Resolution.Winner.AccessMode,
            access.StoredUserIsReadOnly || currentUser.IsReadOnly,
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

        // Only now, past every policy, is the winner's token (and only the winner's) decrypted.
        var connection = new ClusterConnection(access.Endpoint.Url, access.Endpoint.CaBundle?.Pem, access.Endpoint.SkipTlsVerify);
        return new ProxyTarget(access.ClusterId, clusterName.Value, connection, tokenProtector.Unprotect(access.WinnerToken));
    }
}
