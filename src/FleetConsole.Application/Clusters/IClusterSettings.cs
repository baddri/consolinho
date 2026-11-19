using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters;

/// <summary>
/// The editable settings shared by <c>RegisterClusterCommand</c> and <c>UpdateClusterCommand</c>, so both are
/// validated by the same rules (<see cref="ClusterSettingsRules"/>) and turned into Domain values the same way
/// (<see cref="ClusterSettingsInput"/>).
/// </summary>
public interface IClusterSettings
{
    /// <summary>Display name; null or blank defaults to the cluster name.</summary>
    string? DisplayName { get; }

    /// <summary>The API server URL as entered (absolute <c>https://</c>, host and optional port only).</summary>
    string ApiUrl { get; }

    /// <summary>Production, staging or development.</summary>
    ClusterEnvironment Environment { get; }

    /// <summary>Optional <c>https://</c> link to the cluster's own web console; blank means none.</summary>
    string? WebConsoleUrl { get; }

    /// <summary>Optional free-text description; blank means none.</summary>
    string? Description { get; }

    /// <summary>Optional PEM CA bundle; blank means system trust.</summary>
    string? CaBundle { get; }

    /// <summary>Whether TLS verification is skipped; mutually exclusive with <see cref="CaBundle"/>.</summary>
    bool SkipTlsVerify { get; }
}
