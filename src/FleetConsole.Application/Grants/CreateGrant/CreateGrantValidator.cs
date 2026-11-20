using FluentValidation;

namespace FleetConsole.Application.Grants.CreateGrant;

/// <summary>
/// Shape rules of <see cref="CreateGrantCommand"/>. Whether the referenced user, cluster and credential exist (and fit
/// together) needs the database, so the handler reports those as field errors (contract §9.3).
/// </summary>
internal sealed class CreateGrantValidator : AbstractValidator<CreateGrantCommand>
{
    /// <summary>Defines the rules.</summary>
    public CreateGrantValidator()
    {
        RuleFor(c => c.Username).NotEmpty().WithMessage("User is required.");
        RuleFor(c => c.ClusterName).NotEmpty().WithMessage("Cluster is required.");
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);
    }
}
