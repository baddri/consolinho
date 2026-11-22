using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;

namespace FleetConsole.Application.Audit.EventHandlers;

/// <summary>
/// Maps the <see cref="Credential"/> aggregate's events to audit entries (contract §10): <c>credential.added</c>,
/// <c>credential.rotated</c>, <c>credential.deleted</c> and <c>credential.tested</c>. Runs before the write (ADR-0008).
/// </summary>
/// <remarks>
/// The actor is always the current user (an admin). Target is the credential (by name), <c>clusterName</c> its cluster.
/// Tokens are identified by fingerprint only (ADR-0004); the events carry no token material, and neither do the
/// entries. Rotations and tests are recorded every time, also when nothing visible changed: each is an admin action.
/// </remarks>
/// <param name="auditTrail">Stages the entries.</param>
internal sealed class CredentialAuditHandler(IAuditTrail auditTrail) :
    IDomainEventHandler<CredentialAdded>,
    IDomainEventHandler<CredentialRotated>,
    IDomainEventHandler<CredentialDeleted>,
    IDomainEventHandler<CredentialTested>
{
    /// <inheritdoc />
    public Task Handle(CredentialAdded domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCredential(
            "credential.added",
            domainEvent.CredentialId,
            domainEvent.Name,
            domainEvent.ClusterName,
            $"Added credential {domainEvent.Name} to cluster {domainEvent.ClusterName}",
            new
            {
                fingerprint = domainEvent.Fingerprint,
                tokenType = domainEvent.TokenType,
                serviceAccount = domainEvent.ServiceAccount,
                inspectNamespaces = domainEvent.InspectNamespaces,
            });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(CredentialRotated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCredential(
            "credential.rotated",
            domainEvent.CredentialId,
            domainEvent.Name,
            domainEvent.ClusterName,
            $"Rotated the token of credential {domainEvent.Name} on cluster {domainEvent.ClusterName}",
            new { oldFingerprint = domainEvent.OldFingerprint, newFingerprint = domainEvent.NewFingerprint });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(CredentialDeleted domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCredential(
            "credential.deleted",
            domainEvent.CredentialId,
            domainEvent.Name,
            domainEvent.ClusterName,
            $"Deleted credential {domainEvent.Name} from cluster {domainEvent.ClusterName}",
            new { fingerprint = domainEvent.Fingerprint });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(CredentialTested domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        var outcome = domainEvent.Succeeded ? "succeeded" : $"failed at step {domainEvent.FailedStep}";
        RecordCredential(
            "credential.tested",
            domainEvent.CredentialId,
            domainEvent.Name,
            domainEvent.ClusterName,
            $"Tested credential {domainEvent.Name} on cluster {domainEvent.ClusterName}: {outcome}",
            new
            {
                succeeded = domainEvent.Succeeded,
                failedStep = domainEvent.FailedStep,
                headline = domainEvent.Headline,
                inspectNamespaces = domainEvent.InspectNamespaces,
            });
        return Task.CompletedTask;
    }

    /// <summary>Records a <c>credential.*</c> entry: target is the credential, cluster name its cluster.</summary>
    private void RecordCredential(string action, CredentialId credentialId, string name, string clusterName, string summary, object details) =>
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.Credential,
            credentialId.Value.ToString(),
            name,
            clusterName,
            summary,
            details));
}
