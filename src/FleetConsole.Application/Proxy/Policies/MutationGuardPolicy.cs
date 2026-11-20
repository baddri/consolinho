using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy.Policies;

/// <summary>
/// Blocks mutations by read-only users and through read-only grants (MUT-2/3). The user check comes first, so a
/// read-only user always sees "Your account is read-only." even when the grant is read-only too. What counts as a
/// mutation is decided once by <c>ProxyRequest.Create</c> (MUT-1/4), not here.
/// </summary>
internal sealed class MutationGuardPolicy : IProxyPolicy
{
    /// <inheritdoc />
    public ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!context.Request.IsMutation)
        {
            return ValueTask.FromResult(Result.Success());
        }

        if (context.UserIsReadOnly)
        {
            return ValueTask.FromResult(Result.Failure(ProxyErrors.UserReadOnly));
        }

        return ValueTask.FromResult(context.GrantMode == AccessMode.ReadOnly
            ? Result.Failure(ProxyErrors.ReadOnlyGrant(context.ClusterName))
            : Result.Success());
    }
}
