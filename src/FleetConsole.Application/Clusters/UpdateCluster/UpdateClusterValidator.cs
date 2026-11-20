using FluentValidation;

namespace FleetConsole.Application.Clusters.UpdateCluster;

/// <summary>
/// Field rules for <see cref="UpdateClusterCommand"/>: the shared <see cref="ClusterSettingsRules"/>. The name comes
/// from the route and is checked by the handler (unknown or malformed → 404), not here.
/// </summary>
internal sealed class UpdateClusterValidator : AbstractValidator<UpdateClusterCommand>
{
    /// <summary>Creates the rules.</summary>
    public UpdateClusterValidator() => this.AddClusterSettingsRules();
}
