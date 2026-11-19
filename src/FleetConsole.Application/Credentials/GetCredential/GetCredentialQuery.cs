using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Credentials.GetCredential;

/// <summary>
/// Reads one credential of a cluster. Not an endpoint of its own: the add and rotate endpoints dispatch it after their
/// command committed, so the response carries the post-commit <c>version</c> (ADR-0013 §5).
/// </summary>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="CredentialId">The credential; unknown or of another cluster → <c>Credentials.NotFound</c>.</param>
public sealed record GetCredentialQuery(string ClusterName, Guid CredentialId) : IQuery<CredentialDto>, IAdminRequest;
