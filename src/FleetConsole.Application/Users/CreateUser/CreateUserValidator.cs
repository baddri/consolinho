using FleetConsole.Domain.Users;
using FluentValidation;

namespace FleetConsole.Application.Users.CreateUser;

/// <summary>
/// Field rules for <see cref="CreateUserCommand"/>. The username rules live in <see cref="Username.Create"/> (the
/// single source of truth); this validator only puts its message on the <c>username</c> field.
/// </summary>
internal sealed class CreateUserValidator : AbstractValidator<CreateUserCommand>
{
    /// <summary>Declares the rules.</summary>
    public CreateUserValidator()
    {
        RuleFor(c => c.Username).Custom((username, context) =>
        {
            var result = Username.Create(username);
            if (result.IsFailure)
            {
                context.AddFailure(result.Error.Message);
            }
        });

        // JSON binding already refuses unknown enum names; this guards other callers of the command.
        RuleFor(c => c.Role).IsInEnum().WithMessage("Role must be admin or user.");
    }
}
