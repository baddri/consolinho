using FleetConsole.Domain.Clusters;
using FluentValidation;

namespace FleetConsole.Application.Clusters.RegisterCluster;

/// <summary>
/// Field rules for <see cref="RegisterClusterCommand"/> (contract §8.2): the name through <see cref="ClusterName.Create"/>
/// (its message on <c>name</c>), everything else through the shared <see cref="ClusterSettingsRules"/>.
/// </summary>
internal sealed class RegisterClusterValidator : AbstractValidator<RegisterClusterCommand>
{
    /// <summary>Creates the rules.</summary>
    public RegisterClusterValidator()
    {
        RuleFor(x => x.Name).Custom((name, context) =>
        {
            var result = ClusterName.Create(name);
            if (result.IsFailure)
            {
                context.AddFailure(result.Error.Message);
            }
        });

        this.AddClusterSettingsRules();
    }
}
