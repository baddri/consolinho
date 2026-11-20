using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.GetCurrentUser;

/// <summary>
/// Answers <see cref="GetCurrentUserQuery"/>: session facts from <see cref="ICurrentUser"/>, profile facts projected
/// from the read model.
/// </summary>
/// <remarks>
/// A session whose user row is gone (not expected: users are never deleted) is answered as unauthenticated rather than
/// 404, because <c>/me</c> without a valid user means "not signed in" to the SPA.
/// </remarks>
internal sealed class GetCurrentUserHandler(ICurrentUser currentUser, IReadModel readModel)
    : IRequestHandler<GetCurrentUserQuery, Result<CurrentUserDto>>
{
    /// <inheritdoc />
    public async Task<Result<CurrentUserDto>> Handle(GetCurrentUserQuery request, CancellationToken cancellationToken)
    {
        if (currentUser.UserId is not { } userId)
        {
            return AuthErrors.Unauthenticated;
        }

        var query = readModel.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.Username, u.DisplayName, u.Groups, u.AdminConfigurationSource });
        var row = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return AuthErrors.Unauthenticated;
        }

        return new CurrentUserDto(
            row.Username.Value,
            row.DisplayName,
            currentUser.IsInRole(UserRole.Admin) ? UserRole.Admin : UserRole.User,
            currentUser.IsReadOnly,
            // Already filtered at login; filtering again keeps rows stored before that rule existed clean too.
            OpenShiftGroups.WithoutVirtualGroups(row.Groups),
            IsAdminViaConfiguration: row.AdminConfigurationSource is not null,
            row.AdminConfigurationSource);
    }
}
