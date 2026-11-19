namespace FleetConsole.Application.Audit.ListAuditEntries;

// Returned by GET /api/admin/audit. Published in the OpenAPI document as the "AuditPage" schema; the XML docs below are
// written for API consumers.

/// <summary>One page of the audit log, newest first.</summary>
/// <param name="Items">The entries of this page, newest first.</param>
/// <param name="NextCursor">Pass as cursor to get the next (older) page; null when this is the last page.</param>
public sealed record AuditPageDto(IReadOnlyList<AuditEntryDto> Items, string? NextCursor);
