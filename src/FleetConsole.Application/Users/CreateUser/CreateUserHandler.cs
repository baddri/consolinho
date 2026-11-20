using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.CreateUser;

/// <summary>
/// Handles <see cref="CreateUserCommand"/>: refuses a taken username (409 <c>Users.UsernameTaken</c>), then stages
/// <see cref="User.PreCreate"/> with the acting admin as creator. A concurrent create of the same name is caught by the
/// unique index at commit (409 <c>Persistence.DuplicateKey</c>, <c>UnitOfWorkBehavior</c>).
/// </summary>
internal sealed class CreateUserHandler(IUserRepository users, ICurrentUser currentUser, IClock clock)
    : IRequestHandler<CreateUserCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(CreateUserCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (currentUser.Username is not { } actor)
        {
            // AuthorizationBehavior already refuses anonymous callers; this guards direct handler use.
            return AuthErrors.Unauthenticated;
        }

        // The validator has run, so this succeeds; keep the Result check rather than assume it.
        var name = Username.Create(request.Username);
        if (name.IsFailure)
        {
            return name.Error;
        }

        if (await users.ExistsAsync(name.Value, cancellationToken).ConfigureAwait(false))
        {
            return UserErrors.UsernameTaken(name.Value.Value);
        }

        var user = User.PreCreate(name.Value, request.Role, request.IsReadOnly, actor, clock.UtcNow);
        users.Add(user);
        return user.Username.Value;
    }
}
