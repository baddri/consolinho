using System.Globalization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Audit;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// Handles <see cref="RecordProxyAuditCommand"/>: stages one <c>proxy.*</c> entry (target = the Kubernetes resource,
/// actor = the current user via <see cref="IAuditTrail"/>) with the contract §5 details, and returns success so
/// <c>UnitOfWorkBehavior</c> saves it.
/// </summary>
/// <param name="auditTrail">Where the entry is staged.</param>
/// <param name="currentUser">The signed-in user: the summary's subject (the audit trail makes them the actor).</param>
internal sealed class RecordProxyAuditHandler(IAuditTrail auditTrail, ICurrentUser currentUser)
    : IRequestHandler<RecordProxyAuditCommand, Result>
{
    /// <inheritdoc />
    public Task<Result> Handle(RecordProxyAuditCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var record = request.Record;
        ArgumentNullException.ThrowIfNull(record);

        // Programming errors in the caller (the proxy endpoint), not user input: fail loudly rather than write a
        // misleading entry. ProxyAuditActions.For throws for reads.
        var action = ProxyAuditActions.For(record.Request.Verb);
        if ((record.Outcome == ProxyAuditOutcome.Denied) != record.Reason.HasValue)
        {
            throw new ArgumentException(
                "A denial reason is required for denied outcomes and must be absent for allowed ones.", nameof(request));
        }

        if (currentUser.Username is not { } username)
        {
            // AuthorizationBehavior already refuses anonymous callers; this guards direct handler use.
            return Task.FromResult<Result>(AuthErrors.Unauthenticated);
        }

        var info = record.Request.Info;
        auditTrail.Record(new AuditRecord(
            action,
            AuditTargetType.KubernetesResource,
            TargetId: null,
            TargetName: info.DisplayName,
            record.ClusterName,
            Summary(username, record),
            new ProxyAuditDetails(
                record.Request.Method,
                info.Path,
                info.Group,
                info.Version,
                info.Resource,
                info.Subresource,
                info.Namespace,
                info.Name,
                record.Request.DryRun,
                record.Request.FieldManager,
                record.StatusCode,
                record.Outcome,
                record.Reason)));
        return Task.FromResult(Result.Success());
    }

    // "sam updated shop/configmaps/web on dev-1 (200)" / "Denied: alice tried to delete shop/pods/web-1 on dev-1
    // (read-only grant)" — contract §5. Without a valid cluster name the " on <cluster>" part is left out.
    private static string Summary(string username, ProxyAuditRecord record)
    {
        var target = record.Request.Info.DisplayName;
        var on = record.ClusterName is { } cluster ? $" on {cluster}" : string.Empty;
        var (past, infinitive) = VerbPhrases(record.Request);

        return record.Reason is { } reason
            ? $"Denied: {username} tried to {infinitive} {target}{on} ({ReasonText(reason)})"
            : string.Create(CultureInfo.InvariantCulture, $"{username} {past} {target}{on} ({record.StatusCode})");
    }

    private static (string Past, string Infinitive) VerbPhrases(ProxyRequest request) => request.Verb switch
    {
        KubernetesVerb.Create => ("created", "create"),
        KubernetesVerb.Update => ("updated", "update"),
        KubernetesVerb.Patch => ("patched", "patch"),
        KubernetesVerb.Delete => ("deleted", "delete"),
        KubernetesVerb.DeleteCollection => ("deleted all of", "delete all of"),
        KubernetesVerb.Connect => ("connected to", "connect to"),
        _ => ($"sent {request.Method} to", $"send {request.Method} to"),
    };

    private static string ReasonText(ProxyDenialReason reason) => reason switch
    {
        ProxyDenialReason.NoAccess => "no access",
        ProxyDenialReason.UserReadOnly => "read-only user",
        ProxyDenialReason.ReadOnlyGrant => "read-only grant",
        ProxyDenialReason.BodyTooLarge => "body too large",
        _ => reason.ToString(),
    };

    /// <summary>
    /// The <c>details</c> object of a proxy entry, serialized camelCase with enums as camelCase strings (contract §5).
    /// A fixed record rather than an anonymous type so the key set is exactly the contract's and nothing else (body,
    /// headers, other query parameters) can slip in.
    /// </summary>
    private sealed record ProxyAuditDetails(
        string Method,
        string Path,
        string? Group,
        string? Version,
        string? Resource,
        string? Subresource,
        string? Namespace,
        string? Name,
        string? DryRun,
        string? FieldManager,
        int StatusCode,
        ProxyAuditOutcome Outcome,
        ProxyDenialReason? Reason);
}
