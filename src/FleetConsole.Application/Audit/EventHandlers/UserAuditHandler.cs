using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;

namespace FleetConsole.Application.Audit.EventHandlers;

/// <summary>
/// Maps the <see cref="User"/> aggregate's events to audit entries (contract §10): <c>auth.login</c>,
/// <c>user.provisioned</c>, <c>user.created</c>, <c>user.promoted</c>/<c>user.demoted</c>, <c>user.deactivated</c>,
/// <c>user.reactivated</c>, <c>user.read_only_changed</c> and <c>user.groups_changed</c>. Runs before the write (ADR-0008).
/// </summary>
/// <remarks>
/// <para><b>Actors:</b> provisioning and login are attributed to the user themselves (AUTH-5); role changes caused by
/// configuration to <see cref="AuditActor.Configuration"/> (AUTH-8); group changes found by session revalidation to
/// <see cref="AuditActor.Revalidation"/> (ADR-0039); everything else to the current user (the admin).</para>
/// <para><b>Promote/demote</b> is chosen from <see cref="UserRoleChanged.NewRole"/>, never from the roles differing:
/// promoting a configuration admin raises <c>Admin → Admin</c> and is still a <c>user.promoted</c> (ADR-0017).</para>
/// <para>Every <c>user.*</c> entry carries the target's username as <see cref="AuditRecord.RelatedUsername"/>; the
/// <c>auth.login</c> entry doesn't (the user is its actor already).</para>
/// </remarks>
/// <param name="auditTrail">Stages the entries.</param>
internal sealed class UserAuditHandler(IAuditTrail auditTrail) :
    IDomainEventHandler<UserLoggedIn>,
    IDomainEventHandler<UserProvisioned>,
    IDomainEventHandler<UserCreated>,
    IDomainEventHandler<UserRoleChanged>,
    IDomainEventHandler<UserDeactivated>,
    IDomainEventHandler<UserReactivated>,
    IDomainEventHandler<UserReadOnlyChanged>,
    IDomainEventHandler<UserGroupsChanged>
{
    /// <inheritdoc />
    public Task Handle(UserLoggedIn domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        auditTrail.Record(new AuditRecord(
            "auth.login",
            AuditTargetType.Session,
            domainEvent.UserId.Value.ToString(),
            domainEvent.Username,
            ClusterName: null,
            $"{domainEvent.Username} logged in",
            new { groups = domainEvent.Groups, provisioned = domainEvent.Provisioned },
            AuditActor.ForUser(domainEvent.UserId, domainEvent.Username)));
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserProvisioned domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser(
            "user.provisioned",
            domainEvent.UserId,
            domainEvent.Username,
            $"Provisioned user {domainEvent.Username} at their first login",
            new { source = "login" },
            AuditActor.ForUser(domainEvent.UserId, domainEvent.Username));
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserCreated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser(
            "user.created",
            domainEvent.UserId,
            domainEvent.Username,
            $"Created user {domainEvent.Username}",
            new { role = domainEvent.Role, isReadOnly = domainEvent.IsReadOnly });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserRoleChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);

        // ADR-0017: the action follows the new role only; OldRole may equal NewRole (promoting a config admin).
        var promoted = domainEvent.NewRole == UserRole.Admin;
        var byConfiguration = domainEvent.Source == RoleChangeSource.Configuration;
        var summary = (promoted, byConfiguration) switch
        {
            (true, true) => $"Promoted {domainEvent.Username} to administrator by configuration ({domainEvent.ConfigurationSource})",
            (false, true) => $"Demoted {domainEvent.Username} to user by configuration ({domainEvent.ConfigurationSource})",
            (true, false) => $"Promoted {domainEvent.Username} to administrator",
            (false, false) => $"Demoted {domainEvent.Username} to user",
        };

        RecordUser(
            promoted ? "user.promoted" : "user.demoted",
            domainEvent.UserId,
            domainEvent.Username,
            summary,
            new { source = domainEvent.Source, configurationSource = domainEvent.ConfigurationSource },
            byConfiguration ? AuditActor.Configuration : null);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserDeactivated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser("user.deactivated", domainEvent.UserId, domainEvent.Username, $"Deactivated user {domainEvent.Username}", details: null);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserReactivated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser("user.reactivated", domainEvent.UserId, domainEvent.Username, $"Reactivated user {domainEvent.Username}", details: null);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserReadOnlyChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser(
            "user.read_only_changed",
            domainEvent.UserId,
            domainEvent.Username,
            domainEvent.IsReadOnly
                ? $"Made user {domainEvent.Username} read-only"
                : $"Removed read-only from user {domainEvent.Username}",
            new { isReadOnly = domainEvent.IsReadOnly });
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task Handle(UserGroupsChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        RecordUser(
            "user.groups_changed",
            domainEvent.UserId,
            domainEvent.Username,
            $"Updated {domainEvent.Username}'s groups: {domainEvent.Added.Count} added, {domainEvent.Removed.Count} removed",
            new { added = domainEvent.Added, removed = domainEvent.Removed },
            AuditActor.Revalidation);
        return Task.CompletedTask;
    }

    /// <summary>Records a <c>user.*</c> entry: target and related username are the user.</summary>
    private void RecordUser(string action, UserId userId, string username, string summary, object? details, AuditActor? actor = null) =>
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.User,
            userId.Value.ToString(),
            username,
            ClusterName: null,
            summary,
            details,
            actor,
            RelatedUsername: username));
}
