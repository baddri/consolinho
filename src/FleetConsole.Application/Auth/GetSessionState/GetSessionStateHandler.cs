using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.GetSessionState;

/// <summary>Answers <see cref="GetSessionStateQuery"/> with one projected row from the read model.</summary>
internal sealed class GetSessionStateHandler(IReadModel readModel) : IRequestHandler<GetSessionStateQuery, Result<SessionStateDto>>
{
    /// <inheritdoc />
    public async Task<Result<SessionStateDto>> Handle(GetSessionStateQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var query = readModel.Users
            .Where(u => u.Id == request.UserId)
            .Select(u => new
            {
                u.Username,
                // Effective role spelled out from mapped columns (User.Role is not a column, ADR-0009).
                IsAdmin = u.IsAdminByAssignment || u.AdminConfigurationSource != null,
                u.IsReadOnly,
                u.IsDeactivated,
                u.SecurityStamp,
            });
        var row = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return UserErrors.NotFound(request.UserId.Value.ToString());
        }

        return new SessionStateDto(
            request.UserId,
            row.Username.Value,
            row.IsAdmin ? UserRole.Admin : UserRole.User,
            row.IsReadOnly,
            IsActive: !row.IsDeactivated,
            row.SecurityStamp);
    }
}
