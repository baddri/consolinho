using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Audit;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.TestToken;

/// <summary>
/// Handles <see cref="TestTokenCommand"/>: resolves the cluster and the optional credential (for grant hints), runs the
/// <see cref="ConnectionTester"/> with the token's own JWT metadata (identity fallback), and stages the
/// <c>credential.token_tested</c> audit entry. Changes no aggregate; <c>UnitOfWorkBehavior</c> commits only the audit entry.
/// </summary>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grantRepository">Counts the credential's grants by mode for the hints (no aggregates needed).</param>
/// <param name="tester">Runs the test.</param>
/// <param name="auditTrail">Records the test (ADR-0008 §4: actions without an aggregate change audit explicitly).</param>
internal sealed class TestTokenHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grantRepository,
    ConnectionTester tester,
    IAuditTrail auditTrail) : IRequestHandler<TestTokenCommand, Result<ConnectionTestResultDto>>
{
    /// <summary>The field error when <c>credentialId</c> is not a credential of the cluster (a body reference → 400).</summary>
    public const string UnknownCredentialMessage = "The credential does not exist on this cluster.";

    /// <inheritdoc />
    public async Task<Result<ConnectionTestResultDto>> Handle(TestTokenCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var found = await CredentialLookup.FindClusterAsync(clusters, request.ClusterName, cancellationToken).ConfigureAwait(false);
        if (found.IsFailure)
        {
            return found.Error;
        }

        var cluster = found.Value;
        GrantModeCounts? grants = null;
        if (request.CredentialId is { } credentialId)
        {
            var credential = await credentials.GetByIdAsync(new CredentialId(credentialId), cancellationToken).ConfigureAwait(false);
            if (credential is null || credential.ClusterId != cluster.Id)
            {
                return Error.Validation(new Dictionary<string, string[]>
                {
                    [nameof(TestTokenCommand.CredentialId)] = [UnknownCredentialMessage],
                });
            }

            grants = await grantRepository.CountByModeAsync(credential.Id, cancellationToken).ConfigureAwait(false);
        }

        var result = await tester.RunAsync(
            ConnectionTester.ConnectionOf(cluster),
            request.Token,
            TokenInspector.Inspect(request.Token),
            request.InspectNamespace,
            grants,
            cancellationToken).ConfigureAwait(false);

        var summary = ConnectionTester.SummaryOf(result);
        var outcome = summary.Succeeded ? "succeeded" : $"failed at step {summary.FailedStep}";
        auditTrail.Record(new AuditRecord(
            "credential.token_tested",
            AuditTargetType.Cluster,
            cluster.Id.Value.ToString(),
            cluster.Name.Value,
            cluster.Name.Value,
            $"Tested an unsaved token on cluster {cluster.Name.Value}: {outcome}",
            new
            {
                succeeded = summary.Succeeded,
                failedStep = summary.FailedStep,
                headline = summary.Headline,
                fingerprint = TokenFingerprints.Compute(request.Token).Value,
            }));

        return result;
    }
}
