namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Tuning of <see cref="KeyRingWarmupService"/>'s cross-pod lock. Not bound to configuration: the defaults are the
/// production values, and tests replace the singleton to shorten them.
/// </summary>
internal sealed class KeyRingWarmupOptions
{
    /// <summary>
    /// Postgres <c>lock_timeout</c> while waiting for the key-ring lock. A holder that vanished without closing its
    /// connection (node death, partition) keeps the lock until its session is reaped; past this budget the waiter fails,
    /// logs through the retry Warning and tries again, instead of waiting silently.
    /// </summary>
    public TimeSpan LockTimeout { get; init; } = TimeSpan.FromSeconds(60);
}
