using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;

namespace FleetConsole.Application.Audit.EventHandlers;

/// <summary>
/// Maps the <see cref="Cluster"/> aggregate's events to audit entries (contract §10): <c>cluster.registered</c>,
/// <c>cluster.updated</c>, <c>cluster.enabled</c>, <c>cluster.disabled</c> and <c>cluster.deleted</c>. Runs before the
/// write (ADR-0008).
/// </summary>
/// <remarks>
/// The actor is always the current user (an admin). Target and <c>clusterName</c> are the cluster, so the audit log's
/// <c>cluster</c> filter finds them. CA bundle content is never recorded, only that it changed (<c>changedFields</c>)
/// and the resulting TLS mode. A deletion is one entry with the cascaded counts: removed credentials and grants raise
/// no events of their own.
/// </remarks>
/// <param name="auditTrail">Stages the entries.</param>
internal sealed class ClusterAuditHandler(IAuditTrail auditTrail) :
    IDomainEventHandler<ClusterRegistered>,
    IDomainEventHandler<ClusterUpdated>,
    IDomainEventHandler<ClusterEnabled>,
    IDomainEventHandler<ClusterDisabled>,
    IDomainEventHandler<ClusterDeleted>
{
    /// <inheritdoc />
    public Task Handle(ClusterRegistered domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCluster(
            "cluster.registered",
            domainEvent.ClusterId,
            domainEvent.Name,
            $"Registered cluster {domainEvent.Name}",
            new
            {
                environment = domainEvent.Environment,
                distribution = domainEvent.Distribution,
                apiUrl = domainEvent.ApiUrl,
                tlsMode = domainEvent.TlsMode,
                isEnabled = domainEvent.IsEnabled,
            });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(ClusterUpdated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCluster(
            "cluster.updated",
            domainEvent.ClusterId,
            domainEvent.Name,
            $"Updated cluster {domainEvent.Name} ({string.Join(", ", domainEvent.ChangedFields)})",
            new { changedFields = domainEvent.ChangedFields });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(ClusterEnabled domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCluster("cluster.enabled", domainEvent.ClusterId, domainEvent.Name, $"Enabled cluster {domainEvent.Name}", details: null);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(ClusterDisabled domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCluster("cluster.disabled", domainEvent.ClusterId, domainEvent.Name, $"Disabled cluster {domainEvent.Name}", details: null);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(ClusterDeleted domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordCluster(
            "cluster.deleted",
            domainEvent.ClusterId,
            domainEvent.Name,
            $"Deleted cluster {domainEvent.Name} with {domainEvent.CredentialCount} credential(s) and {domainEvent.GrantCount} grant(s)",
            new { credentialCount = domainEvent.CredentialCount, grantCount = domainEvent.GrantCount });
        return Task.CompletedTask;
    }

    /// <summary>Records a <c>cluster.*</c> entry: target and cluster name are the cluster.</summary>
    private void RecordCluster(string action, ClusterId clusterId, string name, string summary, object? details) =>
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.Cluster,
            clusterId.Value.ToString(),
            name,
            ClusterName: name,
            summary,
            details));
}
