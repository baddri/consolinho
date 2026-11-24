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
/// <para>The actor is always the current user (an admin) and <c>clusterName</c> is set. User grants: target name
/// <c>"&lt;username&gt; → &lt;cluster&gt;"</c>, and the granted user's username is the
/// <see cref="AuditRecord.RelatedUsername"/>, so the audit log's <c>user</c> filter shows a user's grants on their
/// history (USR-7). Group grants (GRP-7): target name <c>"group &lt;group&gt; → &lt;cluster&gt;"</c> (so the
/// <c>target</c> filter finds them by group name), no related user, and details that add <c>subjectKind</c>,
/// <c>groupName</c> and the priority. User-grant details keep their CP1 shape. A bulk grant records one entry per grant
/// (GRANT-4).</para>
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
        var e = domainEvent;
        if (e.SubjectKind == GrantSubjectKind.Group)
        {
            RecordGrant(
                "grant.created", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Granted group {e.SubjectName} {e.AccessMode} on {e.ClusterName} via {e.CredentialName} (priority {e.Priority})",
                new { subjectKind = e.SubjectKind, groupName = e.SubjectName, priority = e.Priority, accessMode = e.AccessMode, credential = e.CredentialName });
        }
        else
        {
            RecordGrant(
                "grant.created", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Granted {e.SubjectName} {e.AccessMode} on {e.ClusterName} via {e.CredentialName}",
                new { username = e.SubjectName, accessMode = e.AccessMode, credential = e.CredentialName });
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(GrantChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        var e = domainEvent;
        if (e.SubjectKind == GrantSubjectKind.Group)
        {
            RecordGrant(
                "grant.changed", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Changed group {e.SubjectName}'s access to {e.ClusterName} to {e.NewAccessMode} via {e.NewCredentialName} (priority {e.NewPriority})",
                new
                {
                    subjectKind = e.SubjectKind,
                    groupName = e.SubjectName,
                    oldPriority = e.OldPriority,
                    newPriority = e.NewPriority,
                    oldAccessMode = e.OldAccessMode,
                    newAccessMode = e.NewAccessMode,
                    oldCredential = e.OldCredentialName,
                    newCredential = e.NewCredentialName,
                });
        }
        else
        {
            RecordGrant(
                "grant.changed", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Changed {e.SubjectName}'s access to {e.ClusterName} to {e.NewAccessMode} via {e.NewCredentialName}",
                new
                {
                    oldAccessMode = e.OldAccessMode,
                    newAccessMode = e.NewAccessMode,
                    oldCredential = e.OldCredentialName,
                    newCredential = e.NewCredentialName,
                });
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(GrantRevoked domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        var e = domainEvent;
        if (e.SubjectKind == GrantSubjectKind.Group)
        {
            RecordGrant(
                "grant.revoked", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Revoked group {e.SubjectName}'s {e.AccessMode} access to {e.ClusterName} (priority {e.Priority})",
                new { subjectKind = e.SubjectKind, groupName = e.SubjectName, priority = e.Priority, accessMode = e.AccessMode, credential = e.CredentialName });
        }
        else
        {
            RecordGrant(
                "grant.revoked", e.GrantId, e.SubjectKind, e.SubjectName, e.ClusterName,
                $"Revoked {e.SubjectName}'s {e.AccessMode} access to {e.ClusterName}",
                new { username = e.SubjectName, accessMode = e.AccessMode, credential = e.CredentialName });
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Records a <c>grant.*</c> entry with the cluster name set. Users: target "user → cluster", related username = the
    /// user. Groups: target "group X → cluster", no related username (a group is not a FleetConsole user).
    /// </summary>
    private void RecordGrant(
        string action,
        GrantId grantId,
        GrantSubjectKind subjectKind,
        string subjectName,
        string clusterName,
        string summary,
        object details)
    {
        var isGroup = subjectKind == GrantSubjectKind.Group;
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.Grant,
            grantId.Value.ToString(),
            isGroup ? $"group {subjectName} → {clusterName}" : $"{subjectName} → {clusterName}",
            clusterName,
            summary,
            details,
            RelatedUsername: isGroup ? null : subjectName));
    }
}
