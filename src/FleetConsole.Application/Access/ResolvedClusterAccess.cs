using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Access;

/// <summary>
/// A user's resolved access to one cluster, as loaded by <see cref="ClusterAccessReader"/>: what the switcher lists and
/// what the proxy needs to forward (endpoint, the winning grant's mode and credential).
/// </summary>
/// <remarks>The token stays encrypted here; only the proxy decrypts it, and only for the cluster it forwards to.</remarks>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name (URL segment).</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="Environment">The cluster's environment.</param>
/// <param name="Distribution">The cluster's distribution.</param>
/// <param name="Endpoint">The API server endpoint (URL, CA bundle, TLS settings).</param>
/// <param name="WebConsoleUrl">The cluster's web console URL as entered, if any.</param>
/// <param name="Username">The user's username.</param>
/// <param name="StoredUserIsReadOnly">The stored user's read-only flag (the session's is the caller's to combine).</param>
/// <param name="Resolution">The winning grant, the effective mode (already narrowed by either read-only flag) and every
/// candidate's verdict.</param>
/// <param name="WinnerToken">The encrypted ServiceAccount token of the winning grant's credential.</param>
/// <param name="WinnerCredentialName">The winning grant's credential name.</param>
/// <param name="CandidateCredentialNames">Every candidate grant's credential name by grant id (the Effective access
/// view lists them per verdict); selected by the same statement, so it costs no extra query.</param>
internal sealed record ResolvedClusterAccess(
    ClusterId ClusterId,
    ClusterName ClusterName,
    string ClusterDisplayName,
    ClusterEnvironment Environment,
    ClusterDistribution Distribution,
    ApiServerEndpoint Endpoint,
    string? WebConsoleUrl,
    string Username,
    bool StoredUserIsReadOnly,
    AccessResolution Resolution,
    EncryptedToken WinnerToken,
    string WinnerCredentialName,
    IReadOnlyDictionary<GrantId, string> CandidateCredentialNames);
