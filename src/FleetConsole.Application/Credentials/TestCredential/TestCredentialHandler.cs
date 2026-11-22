using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Credentials.TestCredential;

/// <summary>
/// Handles <see cref="TestCredentialCommand"/>: decrypts the stored token for this request only, reads the credential's
/// grant counts for the hints, runs the <see cref="ConnectionTester"/> and records the summary on the credential
/// (<c>Credential.RecordTest</c> → <c>CredentialTested</c> → audit). <c>UnitOfWorkBehavior</c> commits both.
/// </summary>
/// <remarks>
/// A rotation committed while the test runs makes the commit fail with <c>Concurrency.Conflict</c> (the result would
/// describe the old token), which is the correct outcome.
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grantRepository">Counts the credential's grants by mode for the hints (no aggregates needed).</param>
/// <param name="tokenProtector">Decrypts the stored token (ADR-0004).</param>
/// <param name="tester">Runs the test.</param>
internal sealed class TestCredentialHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grantRepository,
    ITokenProtector tokenProtector,
    ConnectionTester tester) : IRequestHandler<TestCredentialCommand, Result<ConnectionTestResultDto>>
{
    /// <inheritdoc />
    public async Task<Result<ConnectionTestResultDto>> Handle(TestCredentialCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var found = await CredentialLookup
            .FindCredentialAsync(clusters, credentials, request.ClusterName, request.CredentialId, cancellationToken)
            .ConfigureAwait(false);
        if (found.IsFailure)
        {
            return found.Error;
        }

        var (cluster, credential) = found.Value;
        var grants = await grantRepository.CountByModeAsync(credential.Id, cancellationToken).ConfigureAwait(false);

        var result = await tester.RunAsync(
            ConnectionTester.ConnectionOf(cluster),
            tokenProtector.Unprotect(credential.Token),
            credential.Metadata,
            request.InspectNamespace,
            grants,
            cancellationToken).ConfigureAwait(false);

        // Keeps the saved list for now; T-0141 passes the namespaces the request inspected instead (NST-5).
        credential.RecordTest(ConnectionTester.SummaryOf(result), credential.InspectNamespaces, cluster.Name.Value);
        return result;
    }
}
