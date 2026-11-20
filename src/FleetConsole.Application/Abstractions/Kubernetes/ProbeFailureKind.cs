namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Why a call to a cluster's API server failed, categorized precisely enough for the connection test (T-0020) to tell
/// an admin what to fix in plain language (ADR-0011): a network problem, a TLS trust problem, a token/RBAC problem or an
/// unexpected answer.
/// </summary>
public enum ProbeFailureKind
{
    /// <summary>The API server host name could not be resolved (typo in the URL, DNS not reachable from the console).</summary>
    DnsFailure,

    /// <summary>No TCP connection could be made (nothing listening on the port, firewall reset, network unreachable).</summary>
    ConnectionRefused,

    /// <summary>The API server did not answer within the per-request timeout.</summary>
    Timeout,

    /// <summary>The server certificate does not chain to a trusted CA (missing or wrong CA bundle, self-signed cert).</summary>
    TlsUnknownAuthority,

    /// <summary>The server certificate is valid but not issued for the host name in the API URL.</summary>
    TlsHostnameMismatch,

    /// <summary>The server certificate (or a certificate in its chain) has expired or is not yet valid.</summary>
    TlsCertificateExpired,

    /// <summary>The TLS handshake failed for another reason (protocol mismatch, revoked certificate, unreadable CA bundle).</summary>
    TlsOther,

    /// <summary>HTTP 401: the API server rejected the token (expired, revoked, wrong cluster).</summary>
    Unauthorized,

    /// <summary>HTTP 403: the token is valid but RBAC denies this request.</summary>
    Forbidden,

    /// <summary>HTTP 404: the endpoint or resource does not exist on this cluster (older Kubernetes, not OpenShift).</summary>
    NotFound,

    /// <summary>Any other non-success HTTP status (5xx, 429, …).</summary>
    UnexpectedStatus,

    /// <summary>A success status whose body is not the expected Kubernetes JSON (wrong URL pointing at another service).</summary>
    InvalidResponse,
}
