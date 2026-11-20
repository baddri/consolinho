using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Users.ChangeUserRole;

/// <summary>
/// Handles <see cref="ChangeUserRoleCommand"/>: load + version check (<see cref="UserChanges"/>), then
/// <c>User.ChangeRole</c> with the acting admin and the current number of active writable admins read from the database
/// (ADM-5 must not trust session claims).
/// </summary>
internal sealed class ChangeUserRoleHandler(IUserRepository users, ICurrentUser currentUser)
    : IRequestHandler<ChangeUserRoleCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(ChangeUserRoleCommand request, CancellationToken cancellationToken)
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
        var changed = user.ChangeRole(request.Role, actingUserId, admins);
        return changed.IsSuccess ? user.Username.Value : Result.Failure<string>(changed.Error);
    }
}
