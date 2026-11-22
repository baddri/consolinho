using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Application.Credentials.AddCredential;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Credentials.DeleteCredential;
using FleetConsole.Application.Credentials.GetCredential;
using FleetConsole.Application.Credentials.ListCredentials;
using FleetConsole.Application.Credentials.RotateCredentialToken;
using FleetConsole.Application.Credentials.TestCredential;
using FleetConsole.Application.Credentials.TestToken;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// ServiceAccount credential administration (contract §8.3–§8.4, CRED-1..8): the fleet-wide list
/// <c>/api/admin/credentials</c> and the per-cluster routes under <c>/api/admin/clusters/{name}/credentials</c>.
/// The connection tests (TEST-1..5, ADR-0011): <c>…/credentials/{credentialId}/test</c> and
/// <c>/api/admin/clusters/{name}/test-token</c>.
/// </summary>
/// <remarks>
/// <para><b>Tokens are write-only</b> (CRED-2, SECURITY.md): the endpoints trim the token from the request body and wrap
/// it in <see cref="SensitiveString"/> immediately; nothing returns, logs or audits it — responses carry only the
/// fingerprint and JWT metadata.</para>
/// <para><b>Commands return keys, endpoints re-query</b> (ADR-0013 §5): add and rotate dispatch
/// <see cref="GetCredentialQuery"/> after the commit, so the response carries the post-commit <c>version</c>.</para>
/// </remarks>
public static class CredentialsAdminEndpoints
{
    /// <summary>Maps the credential endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/clusters/{name}/credentials</c> group.</returns>
    public static RouteGroupBuilder MapCredentialsAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        admin.MapGet("/credentials", ListCredentials).WithTags("Credentials").WithName("ListCredentials");

        var credentials = admin.MapGroup("/clusters/{name}/credentials").WithTags("Credentials");
        credentials.MapGet("", ListClusterCredentials).WithName("ListClusterCredentials");
        credentials.MapPost("", AddCredential).WithName("AddCredential");
        credentials.MapPut("/{credentialId:guid}/token", RotateCredentialToken).WithName("RotateCredentialToken");
        credentials.MapDelete("/{credentialId:guid}", DeleteCredential).WithName("DeleteCredential");
        credentials.MapPost("/{credentialId:guid}/test", TestCredential).WithName("TestCredential");

        admin.MapPost("/clusters/{name}/test-token", TestToken).WithTags("Credentials").WithName("TestToken");

        return credentials;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Lists the credentials of all clusters, sorted by expiry (soonest first; no or unknown expiry last), then cluster
    /// and credential name.
    /// </summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the credentials.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<CredentialDto>>, ProblemHttpResult>> ListCredentials(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListCredentialsQuery(null), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>Lists one cluster's credentials, sorted by name. Fails with 404 Clusters.NotFound.</summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the credentials.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<CredentialDto>>, ProblemHttpResult>> ListClusterCredentials(
        string name, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListCredentialsQuery(name), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Stores a ServiceAccount token for the cluster, encrypted and write-only; the response shows its fingerprint and
    /// JWT metadata. Fails with 404 Clusters.NotFound or 409 Credentials.NameTaken.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="request">The credential and its token.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>201 with the credential and its Location.</returns>
    internal static async Task<Results<Created<CredentialDto>, ProblemHttpResult>> AddCredential(
        string name, AddCredentialRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var added = await dispatcher.Send(
            new AddCredentialCommand(name, request.Name, request.Description, ToSensitiveToken(request.Token), request.InspectNamespaces),
            cancellationToken).ConfigureAwait(false);
        if (added.IsFailure)
        {
            return added.ToProblemDetails();
        }

        var detail = await dispatcher.Send(new GetCredentialQuery(name, added.Value), cancellationToken).ConfigureAwait(false);
        return detail.ToHttpResult(credential => TypedResults.Created(
            $"/api/admin/clusters/{Uri.EscapeDataString(credential.ClusterName)}/credentials/{credential.Id}", credential));
    }

    /// <summary>
    /// Replaces the credential's token in place: the id and all grants are kept, the stored last test is cleared, and no
    /// connection test runs. Fails with 404 Clusters.NotFound / Credentials.NotFound; a stale version with 409
    /// Concurrency.Conflict.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="credentialId">The credential id.</param>
    /// <param name="request">The new token and the credential's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated credential.</returns>
    internal static async Task<Results<Ok<CredentialDto>, ProblemHttpResult>> RotateCredentialToken(
        string name, Guid credentialId, RotateCredentialTokenRequest request, IDispatcher dispatcher,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var rotated = await dispatcher.Send(
            new RotateCredentialTokenCommand(name, credentialId, ToSensitiveToken(request.Token), request.Version),
            cancellationToken).ConfigureAwait(false);
        if (rotated.IsFailure)
        {
            return rotated.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetCredentialQuery(name, credentialId), cancellationToken).ConfigureAwait(false))
            .ToHttpResult();
    }

    /// <summary>
    /// Deletes a credential that no grant uses. Fails with 404 Clusters.NotFound / Credentials.NotFound, or 409
    /// Credentials.InUse while grants use it (re-assign or revoke them first).
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="credentialId">The credential id.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>204.</returns>
    internal static async Task<Results<NoContent, ProblemHttpResult>> DeleteCredential(
        string name, Guid credentialId, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new DeleteCredentialCommand(name, credentialId), cancellationToken).ConfigureAwait(false))
            .ToHttpResult();

    /// <summary>
    /// Tests a stored credential against its cluster (also when the cluster is disabled) and stores the outcome as the
    /// credential's last test. A failed test is a 200 whose steps say what failed. Fails with 404 Clusters.NotFound /
    /// Credentials.NotFound.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="credentialId">The credential id.</param>
    /// <param name="request">The test options.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the test result.</returns>
    internal static async Task<Results<Ok<ConnectionTestResultDto>, ProblemHttpResult>> TestCredential(
        string name, Guid credentialId, TestCredentialRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // The time budget (Credentials:ConnectionTestTimeout) is applied by ConnectionTester on top of this token.
        return (await dispatcher.Send(
            new TestCredentialCommand(name, credentialId, request.InspectNamespaces),
            cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }

    /// <summary>
    /// Tests a token that is not stored (before adding or rotating a credential). Nothing is saved except an audit entry
    /// with the token's fingerprint. A failed test is a 200 whose steps say what failed. Fails with 404 Clusters.NotFound,
    /// or 400 when credentialId is not a credential of the cluster.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="request">The token and test options.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the test result.</returns>
    internal static async Task<Results<Ok<ConnectionTestResultDto>, ProblemHttpResult>> TestToken(
        string name, TestTokenRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        return (await dispatcher.Send(
            new TestTokenCommand(name, ToSensitiveToken(request.Token), request.CredentialId, request.InspectNamespaces),
            cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }

    // Contract §8.4: the token is trimmed, then validated (TokenValidationRules). A missing JSON property arrives as
    // null and becomes empty, so validation answers "Token is required." instead of a framework error.
    private static SensitiveString ToSensitiveToken(string? token) => new((token ?? string.Empty).Trim());
}
