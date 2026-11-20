using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// What happened to one proxied mutation, as the Api knows it once the outcome is decided (ADR-0021 §2–3). The handler
/// turns it into exactly one <c>proxy.*</c> audit entry.
/// </summary>
/// <param name="ClusterName">The route's cluster name when it is a valid cluster name, otherwise <see langword="null"/>.</param>
/// <param name="Request">The classified request; only its method, path, parsed resource and <c>dryRun</c>/<c>fieldManager</c>
/// are recorded — never body, headers or the rest of the query.</param>
/// <param name="StatusCode">The upstream status if the cluster answered (also 401), 502/504 on forwarding errors, <c>0</c>
/// when the client disconnected first, or the problem's status for a denial.</param>
/// <param name="Outcome">Whether FleetConsole forwarded the request.</param>
/// <param name="Reason">Why it was denied; required for <see cref="ProxyAuditOutcome.Denied"/>, <see langword="null"/> otherwise.</param>
public sealed record ProxyAuditRecord(
    string? ClusterName,
    ProxyRequest Request,
    int StatusCode,
    ProxyAuditOutcome Outcome,
    ProxyDenialReason? Reason);
