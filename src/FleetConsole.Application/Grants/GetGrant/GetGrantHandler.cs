using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Grants.GetGrant;

/// <summary>Answers <see cref="GetGrantQuery"/> through <see cref="GrantProjection"/>.</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the credential expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class GetGrantHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<GetGrantQuery, Result<GrantDto>>
{
    /// <inheritdoc />
    public async Task<Result<GrantDto>> Handle(GetGrantQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var id = new GrantId(request.GrantId);
        var grants = await GrantProjection
            .LoadAsync(readModel, readModel.Grants.Where(g => g.Id == id), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);
        return grants is [var grant] ? grant : GrantErrors.NotFound();
    }
}
