using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.GetUser;

/// <summary>Answers <see cref="GetUserQuery"/> with one projected row (<see cref="UserRow.Project"/>), or 404.</summary>
internal sealed class GetUserHandler(IReadModel readModel) : IRequestHandler<GetUserQuery, Result<UserDetailDto>>
{
    /// <inheritdoc />
    public async Task<Result<UserDetailDto>> Handle(GetUserQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // An invalid username can't name a stored user: 404 like any unknown route id (ADR-0013 §8).
        var name = Username.Create(request.Username);
        if (name.IsFailure)
        {
            return UserErrors.NotFound(request.Username);
        }

        var username = name.Value;
        var query = UserRow.Project(readModel.Users.Where(u => u.Username == username), readModel);
        var row = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return UserErrors.NotFound(request.Username);
        }

        return row.ToDetail();
    }
}
