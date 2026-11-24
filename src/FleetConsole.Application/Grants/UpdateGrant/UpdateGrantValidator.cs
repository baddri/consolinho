using FleetConsole.Domain.Access;
using FluentValidation;

namespace FleetConsole.Application.Grants.UpdateGrant;

/// <summary>Shape rules of <see cref="UpdateGrantCommand"/>; the credential reference is checked by the handler.</summary>
internal sealed class UpdateGrantValidator : AbstractValidator<UpdateGrantCommand>
{
    /// <summary>Defines the rules.</summary>
    public UpdateGrantValidator()
    {
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);

        // Whether a priority is required or forbidden depends on the stored grant's kind: the handler's call.
        RuleFor(c => c.Priority!.Value)
            .InclusiveBetween(Grant.MinPriority, Grant.MaxPriority).WithMessage(GrantValidation.PriorityMessage)
            .OverridePropertyName(nameof(UpdateGrantCommand.Priority))
            .When(c => c.Priority is not null);
    }
}
