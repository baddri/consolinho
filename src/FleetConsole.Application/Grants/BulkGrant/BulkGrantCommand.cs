using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Grants.BulkGrant;

/// <summary>
/// Gives one user access to several clusters at once, all or nothing (GRANT-4).
/// <c>POST /api/admin/users/{username}/grants/bulk</c>; one <c>grant.created</c> audit entry per created grant.
/// Returns the new grants' ids in request order; the endpoint then reads them with <c>GetGrantsByIdsQuery</c>.
/// </summary>
/// <remarks>
/// Every item problem (unknown cluster or credential, credential of another cluster, existing grant) is a 400 field
/// error keyed by the item's index, all reported together; then nothing is written (contract §9.4). Admin command:
/// refused for read-only admins.
/// </remarks>
/// <param name="Username">The user from the route; unknown → <c>Users.NotFound</c>.</param>
/// <param name="AccessMode">The access mode of every created grant.</param>
/// <param name="Items">1 to <see cref="MaxItems"/> clusters with the credential to use on each; cluster names unique.</param>
public sealed record BulkGrantCommand(string Username, AccessMode AccessMode, IReadOnlyList<BulkGrantItem> Items)
    : ICommand<IReadOnlyList<Guid>>, IAdminRequest, IMutatingCommand
{
    /// <summary>The most items one request may carry (contract §9.4).</summary>
    public const int MaxItems = 100;
}

// Also the item schema of the bulk request body (contract §9.2, "BulkGrantItem"); the XML docs are written for API
// consumers. Reused by the Api's BulkGrantRequest so the OpenAPI document has a single schema of that name.

/// <summary>One cluster of a bulk grant.</summary>
/// <param name="ClusterName">The cluster; unique within the request.</param>
/// <param name="CredentialId">The credential to use on that cluster; must belong to it.</param>
public sealed record BulkGrantItem(string ClusterName, Guid CredentialId);
