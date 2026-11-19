using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit.EventHandlers;

/// <summary>
/// Maps the <see cref="Grant"/> aggregate's events to audit entries (contract §10): <c>grant.created</c>,
/// <c>grant.changed</c> and <c>grant.revoked</c>. Runs before the write (ADR-0008).
/// </summary>
/// <remarks>
/// The actor is always the current user (an admin). The target name is <c>"&lt;username&gt; → &lt;cluster&gt;"</c>,
/// <c>clusterName</c> is set, and the granted user's username is the <see cref="AuditRecord.RelatedUsername"/>, so the
/// audit log's <c>user</c> filter shows a user's grants on their history (USR-7). A bulk grant records one entry per
/// grant (GRANT-4).
/// </remarks>
/// <param name="auditTrail">Stages the entries.</param>
internal sealed class GrantAuditHandler(IAuditTrail auditTrail) :
    IDomainEventHandler<GrantCreated>,
    IDomainEventHandler<GrantChanged>,
    IDomainEventHandler<GrantRevoked>
{
    /// <inheritdoc />
    public Task Handle(GrantCreated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordGrant(
            "grant.created",
            domainEvent.GrantId,
            domainEvent.Username,
            domainEvent.ClusterName,
            $"Granted {domainEvent.Username} {domainEvent.AccessMode} on {domainEvent.ClusterName} via {domainEvent.CredentialName}",
            new { username = domainEvent.Username, accessMode = domainEvent.AccessMode, credential = domainEvent.CredentialName });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(GrantChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordGrant(
            "grant.changed",
            domainEvent.GrantId,
            domainEvent.Username,
            domainEvent.ClusterName,
            $"Changed {domainEvent.Username}'s access to {domainEvent.ClusterName} to {domainEvent.NewAccessMode} via {domainEvent.NewCredentialName}",
            new
            {
                oldAccessMode = domainEvent.OldAccessMode,
                newAccessMode = domainEvent.NewAccessMode,
                oldCredential = domainEvent.OldCredentialName,
                newCredential = domainEvent.NewCredentialName,
            });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(GrantRevoked domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordGrant(
            "grant.revoked",
            domainEvent.GrantId,
            domainEvent.Username,
            domainEvent.ClusterName,
            $"Revoked {domainEvent.Username}'s {domainEvent.AccessMode} access to {domainEvent.ClusterName}",
            new { username = domainEvent.Username, accessMode = domainEvent.AccessMode, credential = domainEvent.CredentialName });
        return Task.CompletedTask;
    }

    /// <summary>Records a <c>grant.*</c> entry: target "user → cluster", cluster name set, related username = the user.</summary>
    private void RecordGrant(string action, GrantId grantId, string username, string clusterName, string summary, object details) =>
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.Grant,
            grantId.Value.ToString(),
            $"{username} → {clusterName}",
            clusterName,
            summary,
            details,
            RelatedUsername: username));
}
