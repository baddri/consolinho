using Yarp.ReverseProxy.Forwarder;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// Log messages of the Kubernetes proxy (EventIds 2400–2499). Per ADR-0020 §9 they carry method, cluster and the path
/// <b>without query</b> — never headers, bodies or exception messages (those can echo URLs and header values).
/// </summary>
internal static partial class ProxyLog
{
    /// <summary>
    /// The audit entry of a proxied mutation could not be written. Logged at Error because the audit trail has a gap;
    /// the request itself already completed (PAUD-3: auditing never fails the request).
    /// </summary>
    /// <param name="logger">The proxy logger.</param>
    /// <param name="exception">What failed, if it threw (null when the command returned a failure).</param>
    /// <param name="method">HTTP method.</param>
    /// <param name="cluster">Cluster name from the route.</param>
    /// <param name="path">Forwarded path, without query.</param>
    /// <param name="statusCode">The status that would have been recorded.</param>
    [LoggerMessage(EventId = 2400, Level = LogLevel.Error,
        Message = "Could not write the proxy audit entry for {Method} {Cluster} {Path} ({StatusCode})")]
    public static partial void AuditFailed(ILogger logger, Exception? exception, string method, string cluster, string path, int statusCode);

    /// <summary>Forwarding to the cluster failed on the upstream side (unreachable, TLS, timeout …).</summary>
    /// <param name="logger">The proxy logger.</param>
    /// <param name="method">HTTP method.</param>
    /// <param name="cluster">Cluster name.</param>
    /// <param name="path">Forwarded path, without query.</param>
    /// <param name="forwarderError">YARP's error kind.</param>
    /// <param name="exceptionType">The exception's type name only (its message may contain the URL).</param>
    /// <param name="httpRequestError">The <see cref="HttpRequestError"/> of an <see cref="HttpRequestException"/>, if any.</param>
    [LoggerMessage(EventId = 2401, Level = LogLevel.Warning,
        Message = "Forwarding {Method} {Cluster} {Path} failed: {ForwarderError} ({ExceptionType}, {HttpRequestError})")]
    public static partial void ForwardFailed(
        ILogger logger, string method, string cluster, string path, ForwarderError forwarderError, string? exceptionType, HttpRequestError? httpRequestError);

    /// <summary>
    /// A proxied stream (watch, followed log, exec/attach) reached its hard lifetime and was ended by the proxy
    /// (ADR-0036 §1). Expected — the client reconnects and is re-authorized — so Debug, not Warning.
    /// </summary>
    /// <param name="logger">The proxy logger.</param>
    /// <param name="method">HTTP method.</param>
    /// <param name="cluster">Cluster name.</param>
    /// <param name="path">Forwarded path, without query.</param>
    [LoggerMessage(EventId = 2402, Level = LogLevel.Debug,
        Message = "Proxied stream {Method} {Cluster} {Path} reached its lifetime and was closed")]
    public static partial void StreamLifetimeReached(ILogger logger, string method, string cluster, string path);
}
