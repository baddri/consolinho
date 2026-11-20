using System.Text.Json;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit.ListAuditEntries;

// Returned inside AuditPageDto. Published in the OpenAPI document as the "AuditEntry" schema; the XML docs below are
// written for API consumers.

/// <summary>One audit log entry: who did what to which object, when, and in which request.</summary>
/// <param name="Id">The entry id.</param>
/// <param name="OccurredAt">When the action happened.</param>
/// <param name="Actor">Who acted: a username, or "system (config)".</param>
/// <param name="ActorIsSystem">Whether FleetConsole itself acted (e.g. a role change from configuration at login).</param>
/// <param name="Action">What happened, e.g. user.deactivated (see the action list in the API contract).</param>
/// <param name="Category">The filter category, matching the action prefix.</param>
/// <param name="TargetType">The kind of object the entry is about.</param>
/// <param name="TargetId">Identifier of the target (a GUID or a name); informational, null when there is none.</param>
/// <param name="TargetName">Display name of the target at the time of the action (kept after deletion).</param>
/// <param name="ClusterName">The cluster the action concerns, if any.</param>
/// <param name="Summary">One human-readable sentence describing the action.</param>
/// <param name="CorrelationId">W3C trace id (32 hex characters) of the request that caused the action, if any.</param>
/// <param name="Details">Action-specific structured data as a JSON object (shape per action); render as JSON. Never contains secrets.</param>
public sealed record AuditEntryDto(
    Guid Id,
    DateTimeOffset OccurredAt,
    string Actor,
    bool ActorIsSystem,
    string Action,
    AuditCategory Category,
    AuditTargetType TargetType,
    string? TargetId,
    string TargetName,
    string? ClusterName,
    string Summary,
    string? CorrelationId,
    JsonElement? Details);
