namespace FleetConsole.Application.Proxy;

/// <summary>
/// Settings of the Kubernetes proxy, bound from the <c>Proxy</c> configuration section (CP2 contract §7) by the Api,
/// which also validates them. Injected into proxy policies and the forwarder as <c>IOptions&lt;ProxyOptions&gt;</c>.
/// </summary>
public sealed class ProxyOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Proxy";

    /// <summary>
    /// Idle timeout of a non-streaming request: no upstream activity for this long → <c>Proxy.UpstreamTimeout</c> (504).
    /// Default 30 seconds.
    /// </summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Maximum <c>timeoutSeconds</c> forwarded for watches (ADR-0020). It also bounds how long an open stream outlives a
    /// revoked grant, because the client must re-authorize when the watch ends. Default 5 minutes; whole seconds, ≥ 1 s.
    /// </summary>
    public TimeSpan WatchTimeoutCap { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>Largest declared body a mutation may carry (MUT-5); larger → <c>Proxy.BodyTooLarge</c>. Default 10 MiB.</summary>
    public long MaxMutationBodyBytes { get; set; } = 10 * 1024 * 1024;

    /// <summary>
    /// Grace period added to <see cref="WatchTimeoutCap"/> to form <see cref="StreamIdleTimeout"/>, so an apiserver that
    /// honours <c>timeoutSeconds</c> ends a watch before FleetConsole gives up on it. Default 30 seconds; ≥ 0.
    /// </summary>
    public TimeSpan StreamIdleSlack { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Idle timeout and hard lifetime of non-upgrade streams (watches, followed logs): <see cref="WatchTimeoutCap"/> plus
    /// <see cref="StreamIdleSlack"/>, so an apiserver that honours <c>timeoutSeconds</c> always ends the stream first.
    /// </summary>
    public TimeSpan StreamIdleTimeout => WatchTimeoutCap + StreamIdleSlack;

    /// <summary>
    /// Hard lifetime of an upgraded stream (exec/attach WebSocket), and its idle timeout (ADR-0036 §1): an idle terminal
    /// lives until this cap, then the proxy closes it and the client must reconnect, which re-runs authorization, so a
    /// revoked grant ends an open session within the cap (TERM-8). Default 60 minutes; whole seconds, ≥ 1 s.
    /// </summary>
    public TimeSpan ExecSessionCap { get; set; } = TimeSpan.FromHours(1);

    /// <summary>
    /// The hard lifetime the endpoint gives a streaming request (ADR-0036 §1): <see cref="ExecSessionCap"/> for an
    /// upgrade, <see cref="StreamIdleTimeout"/> for other streams (watches end earlier via <c>timeoutSeconds</c>;
    /// followed logs are cut here and the SPA resumes with <c>sinceTime</c>). The same value is YARP's activity
    /// timeout for the stream, so an idle stream is never cut before its lifetime.
    /// </summary>
    /// <param name="isUpgrade">Whether the request is a protocol upgrade (exec/attach).</param>
    /// <returns>How long the stream may stay open.</returns>
    public TimeSpan StreamLifetime(bool isUpgrade) => isUpgrade ? ExecSessionCap : StreamIdleTimeout;

    /// <summary><see cref="WatchTimeoutCap"/> in whole seconds, as <c>ProxyRequest.ForwardedQueryString</c> takes it.</summary>
    public int WatchTimeoutCapSeconds => (int)WatchTimeoutCap.TotalSeconds;
}
