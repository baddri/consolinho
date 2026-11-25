namespace FleetConsole.Application.Fleet;

// Published in the OpenAPI document (camelCase strings) as part of the fleet status line (contract §2); the XML docs
// below are written for API consumers.

/// <summary>Why a cluster could not be read at all; when set, every section of the line is null.</summary>
public enum FleetClusterFailure
{
    /// <summary>DNS failure, connection refused/reset or network unreachable.</summary>
    Unreachable,

    /// <summary>The cluster's probes did not finish within <c>Fleet:ClusterTimeout</c> (default 5 s).</summary>
    Timeout,

    /// <summary>TLS handshake or certificate failure (CA bundle, expiry, host name).</summary>
    TlsError,

    /// <summary>The API server answered 401: the grant's ServiceAccount token is expired or revoked.</summary>
    TokenInvalid,

    /// <summary>5xx/429, a non-Kubernetes answer, an oversized response, or an internal probe error.</summary>
    UpstreamError,

    /// <summary>A FleetConsole proxy policy refuses this user's read on this cluster; nothing was sent upstream.</summary>
    BlockedByPolicy,
}
