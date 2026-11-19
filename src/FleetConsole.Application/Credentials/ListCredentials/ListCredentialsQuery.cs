using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Credentials.ListCredentials;

/// <summary>
/// Lists credentials with their safe metadata (CRED-3/4/7): the whole fleet (<c>GET /api/admin/credentials</c>, sorted by
/// expiry, soonest first, unknown/no expiry last) or one cluster's (<c>GET /api/admin/clusters/{name}/credentials</c>,
/// sorted by name). Admin query: read-only admins may run it.
/// </summary>
/// <param name="ClusterName">The cluster whose credentials to list; <see langword="null"/> for every cluster. An unknown
/// cluster is <c>Clusters.NotFound</c>.</param>
public sealed record ListCredentialsQuery(string? ClusterName) : IQuery<IReadOnlyList<CredentialDto>>, IAdminRequest;
