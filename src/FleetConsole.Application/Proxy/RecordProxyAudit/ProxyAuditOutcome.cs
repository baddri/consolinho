namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// Whether FleetConsole forwarded an audited proxy mutation (<c>details.outcome</c>, CP2 contract §5). "Allowed" says
/// nothing about success upstream: the cluster's answer is in the status code.
/// </summary>
public enum ProxyAuditOutcome
{
    /// <summary>Forwarded to the cluster; <see cref="ProxyAuditRecord.StatusCode"/> is the upstream (or forwarding) status.</summary>
    Allowed,

    /// <summary>Refused by FleetConsole before forwarding; <see cref="ProxyAuditRecord.Reason"/> says why.</summary>
    Denied,
}
