using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Users.ReactivateUser;

/// <summary>
/// Handles <see cref="ReactivateUserCommand"/>: load + version check (<see cref="UserChanges"/>), then
/// <c>User.Reactivate</c>, which has no failure cases.
/// </summary>
internal sealed class ReactivateUserHandler(IUserRepository users)
    : IRequestHandler<ReactivateUserCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(ReactivateUserCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var loaded = await UserChanges.LoadAsync(users, request.Username, request.Version, cancellationToken).ConfigureAwait(false);
        if (loaded.IsFailure)
        {
            return loaded.Error;
        }

        var user = loaded.Value;
        var changed = user.Reactivate();
        return changed.IsSuccess ? user.Username.Value : Result.Failure<string>(changed.Error);
    }
}
