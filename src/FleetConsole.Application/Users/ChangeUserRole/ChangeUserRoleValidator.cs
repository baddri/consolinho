using FluentValidation;

namespace FleetConsole.Application.Users.ChangeUserRole;

/// <summary>Field rules for <see cref="ChangeUserRoleCommand"/>; the username is a route value (unknown → 404, not 400).</summary>
internal sealed class ChangeUserRoleValidator : AbstractValidator<ChangeUserRoleCommand>
{
    /// <summary>Declares the rules.</summary>
    public ChangeUserRoleValidator() =>
        // JSON binding already refuses unknown enum names; this guards other callers of the command.
        RuleFor(c => c.Role).IsInEnum().WithMessage("Role must be admin or user.");
}
