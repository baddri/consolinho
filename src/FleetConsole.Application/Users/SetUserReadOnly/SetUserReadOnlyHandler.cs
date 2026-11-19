using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Users.SetUserReadOnly;

/// <summary>
/// Handles <see cref="SetUserReadOnlyCommand"/>: load + version check (<see cref="UserChanges"/>), then
/// <c>User.SetReadOnly</c> with the current number of active writable admins read from the database.
/// </summary>
internal sealed class SetUserReadOnlyHandler(IUserRepository users)
    : IRequestHandler<SetUserReadOnlyCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(SetUserReadOnlyCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var loaded = await UserChanges.LoadAsync(users, request.Username, request.Version, cancellationToken).ConfigureAwait(false);
        if (loaded.IsFailure)
        {
            return loaded.Error;
        }

        var user = loaded.Value;
        var admins = await users.CountActiveWritableAdminsAsync(cancellationToken).ConfigureAwait(false);
        var changed = user.SetReadOnly(request.IsReadOnly, admins);
        return changed.IsSuccess ? user.Username.Value : Result.Failure<string>(changed.Error);
    }
}
