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
    /// Idle timeout for streaming responses: the watch cap plus a grace period, so an apiserver that honours
    /// <c>timeoutSeconds</c> always ends the stream before FleetConsole gives up on it.
    /// </summary>
    public TimeSpan StreamIdleTimeout => WatchTimeoutCap + TimeSpan.FromSeconds(30);

    /// <summary><see cref="WatchTimeoutCap"/> in whole seconds, as <c>ProxyRequest.ForwardedQueryString</c> takes it.</summary>
    public int WatchTimeoutCapSeconds => (int)WatchTimeoutCap.TotalSeconds;
}
