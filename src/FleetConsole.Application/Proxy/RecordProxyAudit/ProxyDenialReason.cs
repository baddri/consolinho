namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// Why FleetConsole refused a proxied mutation (<c>details.reason</c>, CP2 contract §5). Mirrors the denials the
/// proxy policies produce; requests rejected before a resource could be parsed (unauthenticated, CSRF, bad path) are
/// not audited at all (ADR-0021 §2).
/// </summary>
public enum ProxyDenialReason
{
    /// <summary>The user has no grant for the cluster, or the cluster is unknown/disabled (404).</summary>
    NoAccess,

    /// <summary>The user account is read-only (403).</summary>
    UserReadOnly,

    /// <summary>The user's grant for this cluster is read-only (403).</summary>
    ReadOnlyGrant,

    /// <summary>The request body exceeds the configured limit (413).</summary>
    BodyTooLarge,
}
