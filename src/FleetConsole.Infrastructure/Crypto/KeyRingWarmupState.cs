namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Whether this pod's <see cref="KeyRingWarmupService"/> has loaded the Data Protection key ring at least once. Shared
/// (singleton) between the warm-up, which sets it, and <see cref="KeyRingHealthCheck"/>, which keeps the pod unready
/// until then.
/// </summary>
/// <remarks>
/// With several replicas a pod must not serve requests before its ring is loaded: the lazy first-use load is not
/// serialised across pods, so on an empty key table each pod could create and cache its own key, and payloads
/// protected on one pod would be unreadable on the others (ADR-0030 amendment 2026-11-24). Once set it never resets:
/// later ring refreshes are the framework's and never need a new first key.
/// </remarks>
internal sealed class KeyRingWarmupState
{
    // Written by the warm-up's thread, read by health-check requests; volatile makes the write visible at once.
    private volatile bool _isLoaded;

    /// <summary>True once the warm-up has loaded the key ring under the cross-pod lock.</summary>
    public bool IsLoaded => _isLoaded;

    /// <summary>Records the successful load; called once by <see cref="KeyRingWarmupService"/>.</summary>
    public void MarkLoaded() => _isLoaded = true;
}
