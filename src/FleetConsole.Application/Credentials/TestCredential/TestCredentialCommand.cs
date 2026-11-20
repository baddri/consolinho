using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials.ConnectionTesting;

namespace FleetConsole.Application.Credentials.TestCredential;

/// <summary>
/// Tests a stored credential against its cluster (TEST-1..4) and stores the outcome as the credential's last test
/// (TEST-5). <c>POST /api/admin/clusters/{name}/credentials/{credentialId}/test</c>; audited as
/// <c>credential.tested</c> through the <c>CredentialTested</c> event.
/// </summary>
/// <remarks>
/// Works on disabled clusters (TEST-1). A failed test is a <b>successful</b> result carrying the failed step; only unknown
/// cluster/credential and invalid input are errors. Admin command and mutating (it records the last test), so read-only
/// admins get <c>Auth.ReadOnly</c>.
/// </remarks>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="CredentialId">The credential; unknown or of another cluster → <c>Credentials.NotFound</c>.</param>
/// <param name="InspectNamespace">Optional namespace to list the token's rules in.</param>
public sealed record TestCredentialCommand(string ClusterName, Guid CredentialId, string? InspectNamespace)
    : ICommand<ConnectionTestResultDto>, IAdminRequest, IMutatingCommand;
