using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Access;

/// <summary>
/// A user's resolved access to one cluster, as resolved by <see cref="ClusterAccessReader"/> from the cached snapshot: what the switcher lists and
/// what the proxy needs to forward (endpoint, the winning grant's mode and credential).
/// </summary>
/// <remarks>The token stays encrypted here; only the proxy decrypts it, and only for the cluster it forwards to.</remarks>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name (URL segment).</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="Environment">The cluster's environment.</param>
/// <param name="Distribution">The cluster's distribution.</param>
/// <param name="Connection">How to reach the API server (URL, CA bundle PEM, TLS settings), ready for the forwarder.</param>
/// <param name="WebConsoleUrl">The cluster's web console URL as entered, if any.</param>
/// <param name="Username">The user's username.</param>
/// <param name="StoredUserIsReadOnly">The stored user's read-only flag (the session's is the caller's to combine).</param>
/// <param name="Resolution">The winning grant, the effective mode (already narrowed by either read-only flag) and every
/// candidate's verdict.</param>
/// <param name="WinnerToken">The encrypted ServiceAccount token of the winning grant's credential.</param>
/// <param name="WinnerCredentialName">The winning grant's credential name.</param>
/// <param name="WinnerInspectNamespaces">The winning grant's credential's saved inspect namespaces, in saved order (names
/// only): a UI hint for the namespace selector when listing namespaces is forbidden; the token still decides what the
/// user can actually read (CP5.5 NSA-1).</param>
/// <param name="CandidateCredentialNames">Every candidate grant's credential name by grant id (the Effective access
/// view lists them per verdict); part of the same snapshot, so it costs no extra query.</param>
internal sealed record ResolvedClusterAccess(
    ClusterId ClusterId,
    ClusterName ClusterName,
    string ClusterDisplayName,
    ClusterEnvironment Environment,
    ClusterDistribution Distribution,
    ClusterConnection Connection,
    string? WebConsoleUrl,
    string Username,
    bool StoredUserIsReadOnly,
    AccessResolution Resolution,
    EncryptedToken WinnerToken,
    string WinnerCredentialName,
    IReadOnlyList<string> WinnerInspectNamespaces,
    IReadOnlyDictionary<GrantId, string> CandidateCredentialNames);
