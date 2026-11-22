using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Credentials.AddCredential;

/// <summary>
/// Stores a ServiceAccount token for a cluster under a name (CRED-1): encrypted at rest, with its fingerprint and JWT
/// metadata for display (CRED-3). <c>POST /api/admin/clusters/{name}/credentials</c>; audited as <c>credential.added</c>.
/// Returns the new credential's id; the endpoint then reads the representation with <c>GetCredentialQuery</c>.
/// </summary>
/// <remarks>
/// Allowed on disabled clusters (admins prepare credentials before enabling). Admin command: refused for read-only
/// admins. The token is write-only and travels as <see cref="SensitiveString"/>, so this record prints <c>[redacted]</c>.
/// </remarks>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="Name">The credential name, unique within the cluster (<c>Credentials.NameTaken</c>).</param>
/// <param name="Description">Optional description; blank is stored as none.</param>
/// <param name="Token">The token, already trimmed by the Api (contract §8.4).</param>
/// <param name="InspectNamespaces">Optional namespaces (up to 10) the connection test inspects, saved on the credential (NST-5); null means none.</param>
public sealed record AddCredentialCommand(
    string ClusterName,
    string Name,
    string? Description,
    SensitiveString Token,
    IReadOnlyList<string>? InspectNamespaces = null)
    : ICommand<Guid>, IAdminRequest, IMutatingCommand;
