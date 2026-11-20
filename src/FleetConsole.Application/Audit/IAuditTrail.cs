using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit;

/// <summary>
/// The single place audit entries are composed (ADR-0008 §3): callers describe <em>what</em> happened as an
/// <see cref="AuditRecord"/>; the implementation adds actor, time and correlation id and stages an
/// <see cref="AuditEntry"/> in the current unit of work, so it commits atomically with the change.
/// </summary>
/// <remarks>
/// Called from the pre-commit audit event handlers (<c>Application/Audit/EventHandlers</c>) and, for actions that change
/// no aggregate (denied login, logout, testing an unsaved token), from the command handler itself, which then returns a
/// successful result so <c>UnitOfWorkBehavior</c> saves the entry. Implemented by <see cref="AuditTrail"/> (scoped).
/// </remarks>
public interface IAuditTrail
{
    /// <summary>Stages one audit entry; nothing is written until the unit of work commits.</summary>
    /// <param name="record">What happened.</param>
    void Record(AuditRecord record);
}

/// <summary>
/// What an audited action did, as described by the caller of <see cref="IAuditTrail.Record"/>; see contract §10 for the
/// actions, targets and <paramref name="Details"/> shapes.
/// </summary>
/// <param name="Action">The action, e.g. <c>user.deactivated</c>; its prefix decides the category.</param>
/// <param name="TargetType">The kind of object the entry is about.</param>
/// <param name="TargetId">The target's id (GUID or name), if any.</param>
/// <param name="TargetName">The target's display name at the time (e.g. <c>alice → prod-eu-1</c> for grants).</param>
/// <param name="ClusterName">The cluster the action concerns, if any.</param>
/// <param name="Summary">One human-readable sentence.</param>
/// <param name="Details">An object serialized to the entry's JSON details (camelCase); <see langword="null"/> means
/// <c>{}</c>. Never put secrets in it: fingerprints only.</param>
/// <param name="Actor">Who acted; <see langword="null"/> means the current user (e.g. <see cref="AuditActor.Configuration"/>
/// or the logging-in user are passed explicitly).</param>
/// <param name="RelatedUsername">The user the action is about besides the actor: the target user's username for every
/// <c>user.*</c> entry, the granted user's username for every <c>grant.*</c> entry, <see langword="null"/> otherwise.
/// Stored on the entry so the audit log's <c>user</c> filter is an indexed match (contract §10).</param>
public sealed record AuditRecord(
    string Action,
    AuditTargetType TargetType,
    string? TargetId,
    string TargetName,
    string? ClusterName,
    string Summary,
    object? Details = null,
    AuditActor? Actor = null,
    string? RelatedUsername = null);
