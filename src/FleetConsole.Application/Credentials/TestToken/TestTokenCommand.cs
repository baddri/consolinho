using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials.ConnectionTesting;

namespace FleetConsole.Application.Credentials.TestToken;

/// <summary>
/// Tests a token that is not (yet) stored — before adding a credential or rotating one (TEST-1..4).
/// <c>POST /api/admin/clusters/{name}/test-token</c>. Stores nothing on any aggregate (TEST-5); audited explicitly as
/// <c>credential.token_tested</c> with the token's fingerprint, never the token.
/// </summary>
/// <remarks>
/// Admin command and mutating (it writes an audit entry and sends the token to a cluster), so read-only admins get
/// <c>Auth.ReadOnly</c>. A failed test is a successful result carrying the failed step.
/// </remarks>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="Token">The token, already trimmed by the Api; validated like when adding a credential (CRED-1).</param>
/// <param name="CredentialId">Optional credential of this cluster being rotated; supplies the grant counts for the hints.
/// Not a credential of the cluster → 400 field error.</param>
/// <param name="InspectNamespaces">Namespaces to list the token's rules in (0-10 DNS labels; trimmed and de-duplicated by
/// <c>InspectNamespaces</c>); null means none.</param>
public sealed record TestTokenCommand(string ClusterName, SensitiveString Token, Guid? CredentialId, IReadOnlyList<string>? InspectNamespaces)
    : ICommand<ConnectionTestResultDto>, IAdminRequest, IMutatingCommand;
