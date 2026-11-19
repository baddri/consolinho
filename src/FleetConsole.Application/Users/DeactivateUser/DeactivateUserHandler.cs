using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Users.DeactivateUser;

/// <summary>
/// Handles <see cref="DeactivateUserCommand"/>: load + version check (<see cref="UserChanges"/>), then
/// <c>User.Deactivate</c> with the acting admin and the current number of active writable admins read from the database.
/// </summary>
internal sealed class DeactivateUserHandler(IUserRepository users, ICurrentUser currentUser)
    : IRequestHandler<DeactivateUserCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(DeactivateUserCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (currentUser.UserId is not { } actingUserId)
        {
            // AuthorizationBehavior already refuses anonymous callers; this guards direct handler use.
            return AuthErrors.Unauthenticated;
        }

        var loaded = await UserChanges.LoadAsync(users, request.Username, request.Version, cancellationToken).ConfigureAwait(false);
        if (loaded.IsFailure)
        {
            return loaded.Error;
        }

        var user = loaded.Value;
        var admins = await users.CountActiveWritableAdminsAsync(cancellationToken).ConfigureAwait(false);
        var changed = user.Deactivate(actingUserId, admins);
        return changed.IsSuccess ? user.Username.Value : Result.Failure<string>(changed.Error);
    }
}
