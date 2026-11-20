using FluentValidation;

namespace FleetConsole.Application.Grants.UpdateGrant;

/// <summary>Shape rules of <see cref="UpdateGrantCommand"/>; the credential reference is checked by the handler.</summary>
internal sealed class UpdateGrantValidator : AbstractValidator<UpdateGrantCommand>
{
    /// <summary>Defines the rules.</summary>
    public UpdateGrantValidator() =>
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);
}
