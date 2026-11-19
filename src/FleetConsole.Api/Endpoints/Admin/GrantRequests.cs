using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Domain.Access;

namespace FleetConsole.Api.Endpoints.Admin;

// Request bodies of the grant endpoints (contract §9.2). Published in the OpenAPI document; the XML docs are written for
// API consumers. The bulk items reuse the Application's BulkGrantItem record so the document has one schema of that name.

/// <summary>Gives a user access to a cluster through one of the cluster's ServiceAccount credentials.</summary>
/// <param name="Username">The user; must exist (deactivated users may be granted).</param>
/// <param name="ClusterName">The cluster; must exist (disabled clusters may be granted).</param>
/// <param name="CredentialId">A credential of that cluster.</param>
/// <param name="AccessMode">Whether the user may change resources; read-only when omitted.</param>
public sealed record CreateGrantRequest(string Username, string ClusterName, Guid CredentialId, AccessMode AccessMode = AccessMode.ReadOnly);

/// <summary>Changes a grant's access mode and/or credential.</summary>
/// <param name="AccessMode">The new access mode.</param>
/// <param name="CredentialId">The credential to use from now on (may be the current one); must belong to the grant's cluster.</param>
/// <param name="Version">The grant's version from its last representation.</param>
public sealed record UpdateGrantRequest(AccessMode AccessMode, Guid CredentialId, uint Version);

/// <summary>Gives one user access to several clusters at once; either every item becomes a grant or nothing is written.</summary>
/// <param name="AccessMode">The access mode of every created grant.</param>
/// <param name="Items">1 to 100 clusters with the credential to use on each; each cluster at most once.</param>
public sealed record BulkGrantRequest(AccessMode AccessMode, IReadOnlyList<BulkGrantItem> Items);
