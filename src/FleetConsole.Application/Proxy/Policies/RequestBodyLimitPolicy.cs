using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Proxy.Policies;

/// <summary>
/// Rejects mutations whose declared <c>Content-Length</c> exceeds <see cref="ProxyOptions.MaxMutationBodyBytes"/>
/// (MUT-5) before anything is sent upstream. Bodies without a declared length (chunked) pass here — this policy only
/// sees headers; capping a streamed body while it is forwarded is the Api's job.
/// </summary>
/// <param name="options">The proxy settings.</param>
internal sealed class RequestBodyLimitPolicy(IOptions<ProxyOptions> options) : IProxyPolicy
{
    /// <inheritdoc />
    public ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);

        var limit = options.Value.MaxMutationBodyBytes;
        return ValueTask.FromResult(context.Request is { IsMutation: true, ContentLength: { } length } && length > limit
            ? Result.Failure(ProxyErrors.BodyTooLarge(limit))
            : Result.Success());
    }
}
