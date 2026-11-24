using FleetConsole.Domain.Access;
using FluentValidation;

namespace FleetConsole.Application.Grants.CreateGroupGrant;

/// <summary>
/// Shape rules of <see cref="CreateGroupGrantCommand"/> (contract §3): the group name rules of
/// <see cref="Domain.Access.GroupName.Create"/> (system groups first) and the priority range. Whether cluster and
/// credential exist and fit, and whether the group or priority is taken on the cluster, are the handler's.
/// </summary>
internal sealed class CreateGroupGrantValidator : AbstractValidator<CreateGroupGrantCommand>
{
    /// <summary>Defines the rules.</summary>
    public CreateGroupGrantValidator()
    {
        RuleFor(c => c.GroupName).ValidGroupName();
        RuleFor(c => c.ClusterName).NotEmpty().WithMessage("Cluster is required.");
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);

        // A missing priority binds as 0, so it gets the range message too (GRP-2).
        RuleFor(c => c.Priority).InclusiveBetween(Grant.MinPriority, Grant.MaxPriority).WithMessage(GrantValidation.PriorityMessage);
    }
}
